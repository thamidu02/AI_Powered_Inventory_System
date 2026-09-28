using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Planning;
using RestaurantInventory.API.DTOs.Weather;
using RestaurantInventory.API.Models.Planning;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

/// <summary>
/// Demand planning service: rule-based baseline with ML overlay from the Python AI service.
/// When the ML service is available and has sufficient data, ML predictions replace the rule-based
/// weekly forecast; otherwise the rule-based result is returned transparently as a fallback.
/// </summary>
public class PlanningService : IPlanningService
{
    private readonly ApplicationDbContext _context;
    private readonly IWeatherService _weatherService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PlanningService> _logger;
    private readonly string _aiServiceUrl;

    public PlanningService(
        ApplicationDbContext context,
        IWeatherService weatherService,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<PlanningService> logger)
    {
        _context = context;
        _weatherService = weatherService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _aiServiceUrl = configuration["AiService:BaseUrl"] ?? "http://localhost:8000";
    }

    public async Task<IReadOnlyList<DemandPlan>> GenerateDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd)
    {
        var detailedPlans = await GetDetailedDemandPlansAsync(periodStart, periodEnd);

        // Remove existing plans for this exact period to avoid duplicate rows.
        var periodStartUtc = DateTime.SpecifyKind(periodStart, DateTimeKind.Utc);
        var periodEndUtc   = DateTime.SpecifyKind(periodEnd,   DateTimeKind.Utc);

        var existingPlans = await _context.DemandPlans
            .Where(dp =>
                dp.PeriodStart == periodStartUtc &&
                dp.PeriodEnd   == periodEndUtc)
            .ToListAsync();

        if (existingPlans.Count > 0)
        {
            _context.DemandPlans.RemoveRange(existingPlans);
        }

        var demandPlans = new List<DemandPlan>(detailedPlans.Count);
        foreach (var p in detailedPlans)
        {
            demandPlans.Add(new DemandPlan
            {
                IngredientId    = p.IngredientId,
                PeriodStart     = p.PeriodStart,
                PeriodEnd       = p.PeriodEnd,
                PredictedDemand = p.WeeklyForecast,
                ConfidenceScore = p.ConfidenceScore,
                GeneratedBy     = p.GeneratedBy
            });
        }

        _context.DemandPlans.AddRange(demandPlans);
        await _context.SaveChangesAsync();

        return demandPlans.AsReadOnly();
    }

    public async Task<IReadOnlyList<DemandPlanResponse>> GetDetailedDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd)
    {
        periodStart = DateTime.SpecifyKind(periodStart, DateTimeKind.Utc);
        periodEnd   = DateTime.SpecifyKind(periodEnd,   DateTimeKind.Utc);

        int weekdayDays = 0;
        int weekendDays = 0;
        for (var dt = periodStart.Date; dt < periodEnd.Date; dt = dt.AddDays(1))
        {
            if (dt.DayOfWeek == DayOfWeek.Saturday || dt.DayOfWeek == DayOfWeek.Sunday)
            {
                weekendDays++;
            }
            else
            {
                weekdayDays++;
            }
        }

        if (weekdayDays == 0 && weekendDays == 0)
        {
            var totalDays = (int)Math.Ceiling((periodEnd - periodStart).TotalDays);
            weekdayDays = Math.Max(1, totalDays);
        }

        var today = DateTime.UtcNow.Date;
        var weatherImpact = await _weatherService.GetDemandImpactAsync();
        WeatherForecastSummaryResponse? weatherForecast = null;
        try
        {
            weatherForecast = await _weatherService.GetWeatherForecastAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to retrieve weather forecast summary; proceeding with baseline.");
        }

        var ingredients = await _context.Ingredients
            .Include(i => i.Category)
            .Include(i => i.StockBatches)
            .ToListAsync();

        var activeRecipes = await _context.Recipes
            .Where(r => r.IsActive)
            .Include(r => r.Ingredients)
            .ToListAsync();

        var recipeIngredientsByMenuItem = activeRecipes
            .GroupBy(r => r.MenuItemId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(r => r.Version).First().Ingredients
            );

        var saleItems = await _context.SaleItems
            .Include(si => si.Sale)
            .Where(si =>
                (si.Sale.SaleDate >= periodStart && si.Sale.SaleDate < periodEnd) ||
                (si.Sale.CreatedAt >= periodStart && si.Sale.CreatedAt < periodEnd))
            .ToListAsync();

        var weekdayConsumption = new Dictionary<Guid, decimal>();
        var weekendConsumption = new Dictionary<Guid, decimal>();

        foreach (var si in saleItems)
        {
            if (!recipeIngredientsByMenuItem.TryGetValue(si.MenuItemId, out var recipeIngredients))
            {
                continue;
            }

            var saleDate = si.Sale.SaleDate != default ? si.Sale.SaleDate : si.Sale.CreatedAt;
            bool isWeekend = saleDate.DayOfWeek == DayOfWeek.Saturday || saleDate.DayOfWeek == DayOfWeek.Sunday;

            foreach (var ri in recipeIngredients)
            {
                var quantityConsumed = si.Quantity * ri.QuantityRequired;
                if (isWeekend)
                {
                    weekendConsumption[ri.IngredientId] =
                        weekendConsumption.GetValueOrDefault(ri.IngredientId, 0m) + quantityConsumed;
                }
                else
                {
                    weekdayConsumption[ri.IngredientId] =
                        weekdayConsumption.GetValueOrDefault(ri.IngredientId, 0m) + quantityConsumed;
                }
            }
        }

        var responseList = new List<DemandPlanResponse>(ingredients.Count);

        foreach (var ingredient in ingredients)
        {
            var currentStock = ingredient.StockBatches
                .Where(b => b.Status != "DEPLETED" && b.Quantity > 0 && (!b.ExpiryDate.HasValue || b.ExpiryDate.Value.Date >= today))
                .Sum(b => b.Quantity);

            var totalWeekday = weekdayConsumption.GetValueOrDefault(ingredient.Id, 0m);
            var totalWeekend = weekendConsumption.GetValueOrDefault(ingredient.Id, 0m);

            var avgWeekday = weekdayDays > 0 ? totalWeekday / weekdayDays : 0m;
            var avgWeekend = weekendDays > 0 ? totalWeekend / weekendDays : 0m;

            if (weekdayDays > 0 && weekendDays == 0)
            {
                avgWeekend = avgWeekday;
            }
            else if (weekendDays > 0 && weekdayDays == 0)
            {
                avgWeekday = avgWeekend;
            }
            else if (totalWeekday > 0 && totalWeekend == 0)
            {
                avgWeekend = avgWeekday;
            }
            else if (totalWeekend > 0 && totalWeekday == 0)
            {
                avgWeekday = avgWeekend;
            }

            var baseForecast = Math.Round((avgWeekday * 5m) + (avgWeekend * 2m), 2);
            var categoryName = ingredient.Category?.Name?.ToLowerInvariant() ?? "";
            decimal weatherMultiplier = 1.0m;
            string weatherImpactDesc = "Normal baseline demand.";

            if (categoryName.Contains("meat") || categoryName.Contains("poultry") ||
                categoryName.Contains("dairy") || categoryName.Contains("bakery") ||
                categoryName.Contains("sauce") || categoryName.Contains("dry") ||
                categoryName.Contains("grain") || categoryName.Contains("pasta"))
            {
                weatherMultiplier = weatherImpact.ComfortFoodMultiplier;
                if (weatherMultiplier > 1.0m)
                    weatherImpactDesc = $"+{Math.Round((weatherMultiplier - 1.0m) * 100)}% comfort food buffer due to rainy/cold weather.";
                else if (weatherMultiplier < 1.0m)
                    weatherImpactDesc = $"-{Math.Round((1.0m - weatherMultiplier) * 100)}% reduced comfort meal demand in warm weather.";
            }
            else if (categoryName.Contains("beverage") || categoryName.Contains("drink"))
            {
                weatherMultiplier = weatherImpact.ColdBeverageMultiplier;
                if (weatherMultiplier > 1.0m)
                    weatherImpactDesc = $"+{Math.Round((weatherMultiplier - 1.0m) * 100)}% beverage surge due to warm/sunny weather.";
                else if (weatherMultiplier < 1.0m)
                    weatherImpactDesc = $"-{Math.Round((1.0m - weatherMultiplier) * 100)}% reduced cold drinks demand in cold/rainy weather.";
            }
            else if (categoryName.Contains("produce") || categoryName.Contains("vegetable") ||
                     categoryName.Contains("fruit") || categoryName.Contains("salad") ||
                     categoryName.Contains("herb"))
            {
                weatherMultiplier = weatherImpact.SaladProduceMultiplier;
                if (weatherMultiplier > 1.0m)
                    weatherImpactDesc = $"+{Math.Round((weatherMultiplier - 1.0m) * 100)}% fresh produce surge in warm weather.";
                else if (weatherMultiplier < 1.0m)
                    weatherImpactDesc = $"-{Math.Round((1.0m - weatherMultiplier) * 100)}% lower fresh salad demand in rainy weather.";
            }

            var weeklyForecast = Math.Round(baseForecast * weatherMultiplier, 2);
            var dailyAvg = Math.Round(weeklyForecast / 7m, 2);
            var totalConsumed = totalWeekday + totalWeekend;

            var projectedStock = currentStock - weeklyForecast;
            var projectedShortage = Math.Max(0m, weeklyForecast - currentStock);

            var minStock = ingredient.MinimumStockLevel;
            var maxStock = ingredient.MaximumStockLevel;

            bool reorderRequired = projectedStock < minStock || currentStock < minStock;

            decimal recommendedOrderQuantity = 0m;
            if (reorderRequired)
            {
                var targetStock = maxStock > 0 ? maxStock : (weeklyForecast + minStock);
                recommendedOrderQuantity = Math.Max(0m, targetStock - Math.Max(0m, projectedStock));
            }

            recommendedOrderQuantity = Math.Round(recommendedOrderQuantity, 2);

            var coverageDays = dailyAvg > 0 ? Math.Round(currentStock / dailyAvg, 1) : 999m;

            string riskStatus = "NORMAL";
            if (projectedStock < 0 || currentStock < minStock)
            {
                riskStatus = "STOCK_RISK";
            }
            else if (maxStock > 0 && currentStock > maxStock)
            {
                riskStatus = "OVERSTOCK_RISK";
            }
            else if (minStock > 0 && weeklyForecast > (minStock * 1.5m))
            {
                riskStatus = "HIGH_DEMAND";
            }

            string reason = "Stock level is sufficient for predicted demand";
            if (projectedStock < 0)
            {
                reason = $"Projected shortage of {projectedShortage} {ingredient.Unit} during the upcoming week.";
            }
            else if (currentStock < minStock)
            {
                reason = $"Current stock ({currentStock} {ingredient.Unit}) is below minimum level ({minStock} {ingredient.Unit}).";
            }
            else if (reorderRequired)
            {
                reason = $"Projected stock ({projectedStock} {ingredient.Unit}) falls below minimum safety level ({minStock} {ingredient.Unit}).";
            }
            else if (riskStatus == "OVERSTOCK_RISK")
            {
                reason = $"Current stock ({currentStock} {ingredient.Unit}) exceeds maximum stock level ({maxStock} {ingredient.Unit}).";
            }

            decimal confidenceScore = totalConsumed > 10 ? 0.85m : (totalConsumed > 0 ? 0.70m : 0.10m);

            responseList.Add(new DemandPlanResponse
            {
                Id                       = Guid.NewGuid(),
                IngredientId             = ingredient.Id,
                IngredientName           = ingredient.Name,
                SKU                      = ingredient.SKU,
                Unit                     = ingredient.Unit,
                PeriodStart              = periodStart,
                PeriodEnd                = periodEnd,
                WeeklyForecast           = weeklyForecast,
                DailyAverageDemand       = dailyAvg,
                CurrentStock             = currentStock,
                MinimumStockLevel        = minStock,
                MaximumStockLevel        = maxStock,
                ProjectedStock           = projectedStock,
                ProjectedShortage        = projectedShortage,
                StockCoverageDays        = coverageDays,
                ReorderRequired          = reorderRequired,
                RecommendedOrderQuantity = recommendedOrderQuantity,
                Recommendation           = reorderRequired ? "REORDER" : "NO_REORDER",
                RiskStatus               = riskStatus,
                ConfidenceScore          = confidenceScore,
                GeneratedBy              = weatherMultiplier != 1.0m ? "AI_WEATHER_ENRICHED" : "RULE_BASED",
                Reason                   = reason,
                WeatherMultiplier        = weatherMultiplier,
                WeatherImpact            = weatherImpactDesc
            });
        }

        // ── ML Overlay ────────────────────────────────────────────────────────────
        // Attempt to fetch ML predictions from the Python AI service and overlay them
        // on the rule-based results. On any failure (timeout, service down, insufficient
        // data) the rule-based values are kept — zero disruption to other callers.
        try
        {
            var mlResults = await FetchMlForecastsAsync(weatherForecast);
            if (mlResults is not null && mlResults.Count > 0)
            {
                var mlByIngredient = mlResults
                    .Where(r => r.TryGetValue("ingredientId", out _))
                    .ToDictionary(
                        r => r["ingredientId"]?.ToString() ?? "",
                        r => r
                    );

                for (var i = 0; i < responseList.Count; i++)
                {
                    var plan = responseList[i];
                    if (!mlByIngredient.TryGetValue(plan.IngredientId.ToString(), out var ml))
                        continue;

                    var source = ml.GetValueOrDefault("predictionSource")?.ToString();
                    if (source != "ML") continue; // skip rule-based ML entries

                    if (ml.TryGetValue("weeklyForecast", out var wf) && wf is not null)
                    {
                        var mlWeekly = Convert.ToDecimal(wf);
                        var mlDaily  = mlWeekly / 7m;

                        // Recalculate stock projections with ML forecast
                        var mlProjected  = plan.CurrentStock - mlWeekly;
                        var mlShortage   = Math.Max(0m, mlWeekly - plan.CurrentStock);
                        var mlCoverage   = mlDaily > 0 ? Math.Round(plan.CurrentStock / mlDaily, 1) : 999m;

                        bool mlReorder   = mlProjected < plan.MinimumStockLevel || plan.CurrentStock < plan.MinimumStockLevel;
                        decimal mlOrderQty = 0m;
                        if (mlReorder)
                        {
                            var mlTarget = plan.MaximumStockLevel > 0 ? plan.MaximumStockLevel : (mlWeekly + plan.MinimumStockLevel);
                            mlOrderQty   = Math.Max(0m, mlTarget - Math.Max(0m, mlProjected));
                        }

                        string mlRisk = "NORMAL";
                        if (mlProjected < 0 || plan.CurrentStock < plan.MinimumStockLevel) mlRisk = "STOCK_RISK";
                        else if (plan.MaximumStockLevel > 0 && plan.CurrentStock > plan.MaximumStockLevel) mlRisk = "OVERSTOCK_RISK";
                        else if (plan.MinimumStockLevel > 0 && mlWeekly > (plan.MinimumStockLevel * 1.5m)) mlRisk = "HIGH_DEMAND";

                        plan.WeeklyForecast           = Math.Round(mlWeekly, 2);
                        plan.DailyAverageDemand       = Math.Round(mlDaily, 2);
                        plan.ProjectedStock           = Math.Round(mlProjected, 2);
                        plan.ProjectedShortage        = Math.Round(mlShortage, 2);
                        plan.StockCoverageDays        = mlCoverage;
                        plan.ReorderRequired          = mlReorder;
                        plan.RecommendedOrderQuantity = Math.Round(mlOrderQty, 2);
                        plan.Recommendation           = mlReorder ? "REORDER" : "NO_REORDER";
                        plan.RiskStatus               = mlRisk;
                        plan.PredictionSource         = "ML";
                        plan.GeneratedBy              = "ML_AI_ENRICHED";
                        plan.ModelType                = ml.GetValueOrDefault("modelType")?.ToString();
                        if (ml.TryGetValue("mae", out var mae) && mae is not null)
                            plan.Mae = Convert.ToDecimal(mae);
                        if (ml.TryGetValue("trainingRecords", out var tr) && tr is not null)
                            plan.TrainingRecords = Convert.ToInt32(tr);
                        if (ml.TryGetValue("confidenceScore", out var cs) && cs is not null)
                            plan.ConfidenceScore = Convert.ToDecimal(cs);

                        // Weather Influence
                        if (ml.TryGetValue("weatherInfluence", out var wiObj) && wiObj != null)
                        {
                            try
                            {
                                var wiJson = JsonSerializer.Serialize(wiObj);
                                var wiDto = JsonSerializer.Deserialize<WeatherInfluenceDto>(wiJson, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                                if (wiDto != null)
                                {
                                    plan.WeatherInfluence = wiDto;
                                    plan.WeatherAvailable = true;
                                }
                            }
                            catch
                            {
                                // Safe fallback if influence deserialization fails
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            // ML unavailable — rule-based result is returned as-is
            _ = ex; // suppress unused variable warning; logged by middleware
        }

        return responseList.AsReadOnly();
    }

    /// <summary>
    /// Call the Python AI service /ml/forecast endpoint with optional weather context.
    /// Returns null on any network/parse error so callers can silently fall back.
    /// </summary>
    private async Task<List<Dictionary<string, object?>>?> FetchMlForecastsAsync(WeatherForecastSummaryResponse? weather = null)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5); // fast non-blocking call

            var url = $"{_aiServiceUrl.TrimEnd('/')}/ml/forecast";

            // If weather summary is available, POST full payload; otherwise GET with query param
            if (weather != null)
            {
                var payload = new
                {
                    days = 7,
                    weather = new
                    {
                        city = weather.City,
                        isSimulated = weather.IsSimulated,
                        current = new
                        {
                            temperature = weather.Current.Temperature,
                            humidity = weather.Current.Humidity,
                            condition = weather.Current.Condition,
                            description = weather.Current.Description,
                            rainProbability = weather.Current.RainProbability,
                            windSpeed = weather.Current.WindSpeed,
                        },
                        forecast = weather.Forecast?.Select(f => new
                        {
                            date = f.Date.ToString("yyyy-MM-dd"),
                            dayOfWeek = f.DayOfWeek,
                            tempMin = f.TempMin,
                            tempMax = f.TempMax,
                            condition = f.Condition,
                            description = f.Description,
                            rainProbability = f.RainProbability,
                        }).ToList()
                    }
                };

                var postResponse = await client.PostAsJsonAsync(url, payload);
                if (postResponse.IsSuccessStatusCode)
                {
                    var postJson = await postResponse.Content.ReadFromJsonAsync<MlForecastResponse>();
                    return postJson?.Forecasts;
                }
            }

            // Fallback GET
            var getResponse = await client.GetAsync($"{url}?days=7");
            if (!getResponse.IsSuccessStatusCode) return null;

            var json = await getResponse.Content.ReadFromJsonAsync<MlForecastResponse>();
            return json?.Forecasts;
        }
        catch
        {
            return null;
        }
    }

    // DTO for deserializing the Python ML response
    private sealed record MlForecastResponse(
        string Status,
        List<Dictionary<string, object?>> Forecasts
    );

    public async Task<IReadOnlyList<PlanningRecommendationResponse>> GetRecommendationsAsync(
        DateTime periodStart,
        DateTime periodEnd)
    {
        var plans = await GetDetailedDemandPlansAsync(periodStart, periodEnd);

        var recommendations = plans
            .Where(p => p.ReorderRequired)
            .Select(p => new PlanningRecommendationResponse
            {
                IngredientId             = p.IngredientId,
                IngredientName           = p.IngredientName,
                SKU                      = p.SKU,
                Unit                     = p.Unit,
                CurrentStock             = p.CurrentStock,
                WeeklyForecast           = p.WeeklyForecast,
                MinimumStockLevel        = p.MinimumStockLevel,
                MaximumStockLevel        = p.MaximumStockLevel,
                ProjectedStock           = p.ProjectedStock,
                Shortage                 = p.ProjectedShortage,
                RecommendedOrderQuantity = p.RecommendedOrderQuantity,
                Recommendation           = p.Recommendation,
                Reason                   = p.Reason,
                WeatherMultiplier        = p.WeatherMultiplier,
                WeatherImpact            = p.WeatherImpact,
                WeatherAvailable         = p.WeatherAvailable,
                WeatherInfluence         = p.WeatherInfluence
            })
            .ToList();

        return recommendations.AsReadOnly();
    }

    public async Task<PlanningRiskSummaryResponse> GetRiskAnalyticsAsync(
        DateTime periodStart,
        DateTime periodEnd)
    {
        var plans = await GetDetailedDemandPlansAsync(periodStart, periodEnd);

        var riskItems = plans
            .Where(p => p.RiskStatus != "NORMAL" || p.ReorderRequired)
            .ToList();

        return new PlanningRiskSummaryResponse
        {
            TotalIngredients     = plans.Count,
            StockRiskCount       = plans.Count(p => p.RiskStatus == "STOCK_RISK"),
            HighDemandCount      = plans.Count(p => p.RiskStatus == "HIGH_DEMAND"),
            OverstockRiskCount   = plans.Count(p => p.RiskStatus == "OVERSTOCK_RISK"),
            ReorderRequiredCount = plans.Count(p => p.ReorderRequired),
            RiskItems            = riskItems
        };
    }

    public async Task<IReadOnlyList<DemandHistoryRecordDto>> GetDemandHistoryAsync(
        DateTime from,
        DateTime to,
        Guid? ingredientId = null)
    {
        var fromUtc = DateTime.SpecifyKind(from, DateTimeKind.Utc);
        var toUtc   = DateTime.SpecifyKind(to,   DateTimeKind.Utc);

        // Load active recipes mapping: menuItemId -> list of RecipeIngredients
        var activeRecipes = await _context.Recipes
            .Where(r => r.IsActive)
            .Include(r => r.Ingredients)
            .ToListAsync();

        var recipeMap = activeRecipes
            .GroupBy(r => r.MenuItemId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(r => r.Version).First().Ingredients
            );

        // Fetch sale items within the requested period
        var saleItems = await _context.SaleItems
            .Include(si => si.Sale)
            .Where(si =>
                (si.Sale.SaleDate >= fromUtc && si.Sale.SaleDate < toUtc) ||
                (si.Sale.CreatedAt >= fromUtc && si.Sale.CreatedAt < toUtc))
            .ToListAsync();

        // Load ingredient catalog for name + unit lookup
        var ingredientMap = await _context.Ingredients
            .ToDictionaryAsync(i => i.Id, i => i);

        // Aggregate: date × ingredientId → total consumption
        var dailyAgg = new Dictionary<(DateTime date, Guid ingredientId), decimal>();

        foreach (var si in saleItems)
        {
            if (!recipeMap.TryGetValue(si.MenuItemId, out var recipeIngredients))
                continue;

            var saleDate = (si.Sale.SaleDate != default ? si.Sale.SaleDate : si.Sale.CreatedAt)
                .Date;

            foreach (var ri in recipeIngredients)
            {
                if (ingredientId.HasValue && ri.IngredientId != ingredientId.Value)
                    continue;

                var key = (saleDate, ri.IngredientId);
                var consumed = si.Quantity * ri.QuantityRequired;
                dailyAgg[key] = dailyAgg.GetValueOrDefault(key, 0m) + consumed;
            }
        }

        var result = dailyAgg
            .OrderBy(kvp => kvp.Key.date)
            .ThenBy(kvp => kvp.Key.ingredientId)
            .Select(kvp =>
            {
                ingredientMap.TryGetValue(kvp.Key.ingredientId, out var ing);
                return new DemandHistoryRecordDto
                {
                    Date           = kvp.Key.date,
                    IngredientId   = kvp.Key.ingredientId,
                    IngredientName = ing?.Name ?? "",
                    Unit           = ing?.Unit ?? "",
                    Demand         = Math.Round(kvp.Value, 4),
                };
            })
            .ToList();

        return result.AsReadOnly();
    }
}

