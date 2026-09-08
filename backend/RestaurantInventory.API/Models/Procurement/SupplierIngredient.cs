using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Procurement;

public class SupplierIngredient : BaseEntity
{
    public Guid SupplierId { get; set; }

    public Guid IngredientId { get; set; }

    public string? SupplierSKU { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal MinimumOrderQuantity { get; set; }

    public int LeadTimeDays { get; set; }

    public bool IsPreferred { get; set; }

    public Supplier Supplier { get; set; } = null!;

    public Ingredient Ingredient { get; set; } = null!;
}