using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Planning;

public class DemandPlan : BaseEntity
{
    public Guid IngredientId { get; set; }

    public DateTime PeriodStart { get; set; }

    public DateTime PeriodEnd { get; set; }

    public decimal PredictedDemand { get; set; }

    public decimal? ConfidenceScore { get; set; }

    public string GeneratedBy { get; set; } = "SYSTEM";

    public Ingredient Ingredient { get; set; } = null!;
}