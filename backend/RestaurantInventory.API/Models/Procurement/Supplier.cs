using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Procurement;

public class Supplier : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public string? ContactPerson { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? PaymentTerms { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<SupplierIngredient> SupplierIngredients { get; set; }
        = new List<SupplierIngredient>();

    public ICollection<PurchaseOrder> PurchaseOrders { get; set; }
        = new List<PurchaseOrder>();
}