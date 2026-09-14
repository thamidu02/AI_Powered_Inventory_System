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
            .Where(i => i.IsActive)
            .ToListAsync();

        var demandPlans = new List<DemandPlan>();

        foreach (var ingredient in ingredients)
        {
            var plan = new DemandPlan
            {
                IngredientId = ingredient.Id,
                PeriodStart = periodStart,
                PeriodEnd = periodEnd,
                PredictedDemand = 0,   // guys this is only for now - After Adding AI Part we can change
                ConfidenceScore = 0,   
                GeneratedBy = "RULE_BASED"
            };

            demandPlans.Add(plan);
        }

        return demandPlans;
    }
}