using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Sales;

public class MenuItem : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public decimal SellingPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<Recipe> Recipes { get; set; }
        = new List<Recipe>();

    public ICollection<SaleItem> SaleItems { get; set; }
        = new List<SaleItem>();
}