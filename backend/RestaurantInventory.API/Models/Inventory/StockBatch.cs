using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Procurement;

namespace RestaurantInventory.API.Models.Inventory;

public class StockBatch : BaseEntity
{
    public Guid IngredientId { get; set; }

    public Guid StorageLocationId { get; set; }

    // The goods receipt that created this stock batch.
    public Guid? GoodsReceiptId { get; set; }

    public GoodsReceipt? GoodsReceipt { get; set; }

    public string BatchNumber { get; set; } = string.Empty;

    public decimal Quantity { get; set; }

    public decimal UnitCost { get; set; }

    public DateTime ReceivedDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public string Status { get; set; } = "AVAILABLE";

    public Ingredient Ingredient { get; set; } = null!;

    public StorageLocation StorageLocation { get; set; } = null!;

    public ICollection<StockMovement> StockMovements { get; set; }
        = new List<StockMovement>();
}