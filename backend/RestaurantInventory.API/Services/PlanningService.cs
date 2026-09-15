using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.Models.Planning;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

/// <summary>
/// Rule-based demand planning service.
///
/// Algorithm:
///   1. For each ingredient, compute total consumption within the requested period by
///      joining SaleItems → RecipeIngredients.
///   2. Normalise to a **per-day average** so that plans are comparable regardless of
///      how long the requested window is.
///   3. Upsert into DemandPlans (delete existing row for the same ingredient + period,
///      then insert) to prevent duplicate rows on repeated calls.
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
        // 1. Ensure dates are UTC so EF/Npgsql comparisons work correctly.
        periodStart = DateTime.SpecifyKind(periodStart, DateTimeKind.Utc);
        periodEnd   = DateTime.SpecifyKind(periodEnd,   DateTimeKind.Utc);

        // 2. Count weekday (Mon-Fri) and weekend (Sat-Sun) days in the analysis window.
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

        var ingredients = await _context.Ingredients.ToListAsync();

        // 3. Load active recipes and their ingredients.
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

        // 4. Query sale items within the requested window.
        var saleItems = await _context.SaleItems
            .Include(si => si.Sale)
            .Where(si =>
                (si.Sale.SaleDate >= periodStart && si.Sale.SaleDate < periodEnd) ||
                (si.Sale.CreatedAt >= periodStart && si.Sale.CreatedAt < periodEnd))
            .ToListAsync();

        // 5. Aggregate weekday and weekend ingredient consumption.
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

        // 6. Remove existing plans for this exact period to avoid duplicate rows.
        var existingPlans = await _context.DemandPlans
            .Where(dp =>
                dp.PeriodStart == periodStart &&
                dp.PeriodEnd   == periodEnd)
            .ToListAsync();

        if (existingPlans.Count > 0)
        {
            _context.DemandPlans.RemoveRange(existingPlans);
        }

        var demandPlans = new List<DemandPlan>(ingredients.Count);

        // 7. Calculate daily averages and highest average demand prediction.
        foreach (var ingredient in ingredients)
        {
            var totalWeekday = weekdayConsumption.GetValueOrDefault(ingredient.Id, 0m);
            var totalWeekend = weekendConsumption.GetValueOrDefault(ingredient.Id, 0m);

            var avgWeekday = weekdayDays > 0 ? totalWeekday / weekdayDays : 0m;
            var avgWeekend = weekendDays > 0 ? totalWeekend / weekendDays : 0m;

            var predictedDemand = Math.Round(Math.Max(avgWeekday, avgWeekend), 2);
            var totalConsumed = totalWeekday + totalWeekend;

            demandPlans.Add(new DemandPlan
            {
                IngredientId    = ingredient.Id,
                PeriodStart     = periodStart,
                PeriodEnd       = periodEnd,
                PredictedDemand = predictedDemand,
                ConfidenceScore = totalConsumed > 0 ? 0.7m : 0.1m,
                GeneratedBy     = "RULE_BASED"
            });
        }

        _context.DemandPlans.AddRange(demandPlans);
        await _context.SaveChangesAsync();

        return demandPlans.AsReadOnly();
    }
}
