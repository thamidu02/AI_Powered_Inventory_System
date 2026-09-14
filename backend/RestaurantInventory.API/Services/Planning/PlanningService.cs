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
        var ingredients = await _context.Ingredients
            .ToListAsync();

        var demandPlans = new List<DemandPlan>();

        foreach (var ingredient in ingredients)
        {
            var consumption = await CalculateIngredientConsumptionAsync(
                ingredient.Id,
                periodStart,
                periodEnd);

            var plan = new DemandPlan
            {
                IngredientId = ingredient.Id,
                PeriodStart = periodStart,
                PeriodEnd = periodEnd,
                PredictedDemand = consumption,
                ConfidenceScore = 0,
                GeneratedBy = "RULE_BASED"
            };

            demandPlans.Add(plan);
        }

        return demandPlans;
    }

    private async Task<decimal> CalculateIngredientConsumptionAsync(
        Guid ingredientId,
        DateTime periodStart,
        DateTime periodEnd)
    {
        var consumption = await _context.SaleItems
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
                    QuantitySold = saleItem.Quantity,
                    QuantityRequired = recipeIngredient.QuantityRequired
                })
            .Where(x => x.IngredientId == ingredientId)
            .Select(x => x.QuantitySold * x.QuantityRequired)
            .SumAsync();

        return consumption;
    }
}