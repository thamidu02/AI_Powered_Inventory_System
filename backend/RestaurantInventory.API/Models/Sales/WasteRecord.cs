using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Sales;

public class WasteRecord : BaseEntity
{
    public Guid IngredientId { get; set; }

    public Guid StockBatchId { get; set; }

    public decimal Quantity { get; set; }

    public string Reason { get; set; } = string.Empty;

    public Guid ReportedById { get; set; }

    public string Status { get; set; } = "RECORDED";

    public DateTime RecordedAt { get; set; } = DateTime.UtcNow;

    public Guid? ConfirmedById { get; set; }

    public DateTime? ConfirmedAt { get; set; }

    public Ingredient Ingredient { get; set; } = null!;

    public StockBatch StockBatch { get; set; } = null!;

    public User ReportedBy { get; set; } = null!;

    public User? ConfirmedBy { get; set; }
}