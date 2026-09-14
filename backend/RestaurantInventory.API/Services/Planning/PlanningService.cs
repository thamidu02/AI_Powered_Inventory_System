using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.Models.Planning;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services.Planning;

public class PlanningService : IPlanningService
{
    private readonly ApplicationDbContext _context;

    public PlanningService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<DemandPlan>> GenerateDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd)
    {
        periodStart = DateTime.SpecifyKind(
            periodStart,
            DateTimeKind.Utc);

        periodEnd = DateTime.SpecifyKind(
            periodEnd,
            DateTimeKind.Utc);

        var ingredients = await _context.Ingredients
            .ToListAsync();

        var demandPlans = new List<DemandPlan>();

        foreach (var ingredient in ingredients)
        {
            var (weekdayDemand, weekendDemand, weekdayCount, weekendCount) =
                await CalculateDemandPatternAsync(
                    ingredient.Id,
                    periodStart,
                    periodEnd);

            var averageWeekdayDemand = weekdayCount > 0
                ? weekdayDemand / weekdayCount
                : 0;

            var averageWeekendDemand = weekendCount > 0
                ? weekendDemand / weekendCount
                : 0;

            var predictedDemand = Math.Round(
                Math.Max(
                    averageWeekdayDemand,
                    averageWeekendDemand),
                2);

            var plan = new DemandPlan
            {
                IngredientId = ingredient.Id,
                PeriodStart = periodStart,
                PeriodEnd = periodEnd,
                PredictedDemand = predictedDemand,
                ConfidenceScore = 0,
                GeneratedBy = "RULE_BASED"
            };

            demandPlans.Add(plan);
        }

        _context.DemandPlans.AddRange(demandPlans);

        await _context.SaveChangesAsync();

        return demandPlans;
    }

    private async Task<(
        decimal weekdayDemand, 
        decimal weekendDemand,
        int weekdayCount,
        int weekendCount)>

        CalculateDemandPatternAsync(
            Guid ingredientId,
            DateTime periodStart,
            DateTime periodEnd)
    {
        var consumptionRecords = await _context.SaleItems
            .Where(si =>
                si.Sale.CreatedAt >= periodStart &&
                si.Sale.CreatedAt < periodEnd)
            .Join(
                _context.RecipeIngredients,
                saleItem => saleItem.MenuItemId,
                recipeIngredient => recipeIngredient.Recipe.MenuItemId,
                (saleItem, recipeIngredient) => new
                {
                    recipeIngredient.IngredientId,
                    Date = saleItem.Sale.CreatedAt,
                    QuantityConsumed =
                        saleItem.Quantity *
                        recipeIngredient.QuantityRequired
                })
            .Where(x => x.IngredientId == ingredientId)
            .ToListAsync();

        decimal weekdayDemand = 0;
        decimal weekendDemand = 0;

        int weekdayCount = 0;
        int weekendCount = 0;

        foreach (var record in consumptionRecords)
        {
            if (record.Date.DayOfWeek == DayOfWeek.Saturday ||
                record.Date.DayOfWeek == DayOfWeek.Sunday)
            {
                weekendDemand += record.QuantityConsumed;
                weekendCount++;
            }
            else
            {
                weekdayDemand += record.QuantityConsumed;
                weekdayCount++;
            }
        }

        return (
            weekdayDemand,
            weekendDemand,
            weekdayCount,
            weekendCount);

    }
}