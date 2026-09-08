using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Procurement;

public class PurchaseRequestItem : BaseEntity
{
    public Guid PurchaseRequestId { get; set; }

    public Guid IngredientId { get; set; }

    public decimal RequestedQuantity { get; set; }

    public Guid? SuggestedSupplierId { get; set; }

    public string? Notes { get; set; }

    public PurchaseRequest PurchaseRequest { get; set; } = null!;

    public Ingredient Ingredient { get; set; } = null!;

    public Supplier? SuggestedSupplier { get; set; }
}