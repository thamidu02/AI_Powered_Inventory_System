using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Sales;

public class SaleItem : BaseEntity
{
    public Guid SaleId { get; set; }

    public Guid MenuItemId { get; set; }

    public int Quantity { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal Subtotal { get; set; }

    public Sale Sale { get; set; } = null!;

    public MenuItem MenuItem { get; set; } = null!;
}