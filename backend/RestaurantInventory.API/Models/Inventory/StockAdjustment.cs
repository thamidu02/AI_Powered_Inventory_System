using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Inventory;

public class StockAdjustment : BaseEntity
{
    public Guid IngredientId { get; set; }

    public Guid StockBatchId { get; set; }

    public decimal QuantityChange { get; set; }

    public string Reason { get; set; } = string.Empty;

    // PENDING_APPROVAL, APPROVED, REJECTED, APPLIED
    public string Status { get; set; } = "PENDING_APPROVAL";

    public Guid RequestedById { get; set; }

    public Guid? ApprovedById { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public Ingredient Ingredient { get; set; } = null!;

    public StockBatch StockBatch { get; set; } = null!;

    public User RequestedBy { get; set; } = null!;

    public User? ApprovedBy { get; set; }
}