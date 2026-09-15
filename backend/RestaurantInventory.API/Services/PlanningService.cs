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
        // Ensure dates are UTC so EF/Npgsql comparisons work correctly.
        periodStart = DateTime.SpecifyKind(periodStart, DateTimeKind.Utc);
        periodEnd   = DateTime.SpecifyKind(periodEnd,   DateTimeKind.Utc);

        var periodDays = (decimal)(periodEnd - periodStart).TotalDays;
        if (periodDays <= 0) periodDays = 1;

        var ingredients = await _context.Ingredients.ToListAsync();
        var demandPlans = new List<DemandPlan>(ingredients.Count);

        // Load all relevant consumption in a single query instead of N+1.
        var consumptionByIngredient = await _context.SaleItems
            .Where(si =>
                si.Sale.CreatedAt >= periodStart &&
                si.Sale.CreatedAt <  periodEnd)
            .Join(
                _context.RecipeIngredients,
                si => si.MenuItemId,
                ri => ri.Recipe.MenuItemId,
                (si, ri) => new
                {
                    ri.IngredientId,
                    QuantityConsumed = si.Quantity * ri.QuantityRequired
                })
            .GroupBy(x => x.IngredientId)
            .Select(g => new
            {
                IngredientId = g.Key,
                TotalConsumed = g.Sum(x => x.QuantityConsumed)
            })
            .ToDictionaryAsync(x => x.IngredientId, x => x.TotalConsumed);

        // Remove existing plans for this exact period to avoid duplicates.
        var existingPlans = await _context.DemandPlans
            .Where(dp =>
                dp.PeriodStart == periodStart &&
                dp.PeriodEnd   == periodEnd)
            .ToListAsync();

        if (existingPlans.Count > 0)
        {
            _context.DemandPlans.RemoveRange(existingPlans);
        }

        foreach (var ingredient in ingredients)
        {
            var totalConsumed = consumptionByIngredient.TryGetValue(
                ingredient.Id, out var consumed) ? consumed : 0m;

            // Normalise: average daily demand × period length gives a comparable forecast.
            var dailyAverage    = totalConsumed / periodDays;
            var predictedDemand = Math.Round(dailyAverage * periodDays, 4);

            demandPlans.Add(new DemandPlan
            {
                IngredientId     = ingredient.Id,
                PeriodStart      = periodStart,
                PeriodEnd        = periodEnd,
                PredictedDemand  = predictedDemand,
                ConfidenceScore  = totalConsumed > 0 ? 0.7m : 0.1m,
                GeneratedBy      = "RULE_BASED"
            });
        }

        _context.DemandPlans.AddRange(demandPlans);
        await _context.SaveChangesAsync();

        return demandPlans.AsReadOnly();
    }
}
