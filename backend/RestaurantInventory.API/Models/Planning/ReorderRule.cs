using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Models.Procurement;

namespace RestaurantInventory.API.Models.Planning;

public class ReorderRule : BaseEntity
{
    public Guid IngredientId { get; set; }

    public decimal MinimumStockLevel { get; set; }

    public decimal ReorderPoint { get; set; }

    public decimal TargetStockLevel { get; set; }

    public Guid? PreferredSupplierId { get; set; }

    public int LeadTimeDays { get; set; }

    public bool IsActive { get; set; } = true;

    public Ingredient Ingredient { get; set; } = null!;

    public Supplier? PreferredSupplier { get; set; }
}