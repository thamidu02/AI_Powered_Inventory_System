using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Inventory;

public class Ingredient : BaseEntity
{
    public Guid CategoryId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string SKU { get; set; } = string.Empty;

    public string Unit { get; set; } = string.Empty;

    public decimal MinimumStockLevel { get; set; }

    public decimal MaximumStockLevel { get; set; }

    public IngredientCategory Category { get; set; } = null!;

    public ICollection<StockBatch> StockBatches { get; set; }
        = new List<StockBatch>();

    public ICollection<StockMovement> StockMovements { get; set; }
        = new List<StockMovement>();
}