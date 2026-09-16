using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Planning;
using RestaurantInventory.API.Models.Planning;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

/// <summary>
/// Rule-based demand planning service.
/// </summary>
public class PlanningService : IPlanningService
{
    private readonly ApplicationDbContext _context;

    public PlanningService(ApplicationDbContext context)
    {
        _context = context;
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
        var ingredients = await _context.Ingredients
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

            var weeklyForecast = Math.Round((avgWeekday * 5m) + (avgWeekend * 2m), 2);
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
                GeneratedBy              = "RULE_BASED",
                Reason                   = reason
            });
        }

        return responseList.AsReadOnly();
    }

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
                Reason                   = p.Reason
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
}
