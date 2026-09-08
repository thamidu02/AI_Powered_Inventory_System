using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Sales;

public class Sale : BaseEntity
{
    public Guid RecordedById { get; set; }

    public DateTime SaleDate { get; set; } = DateTime.UtcNow;

    public decimal TotalAmount { get; set; }

    public string Status { get; set; } = "COMPLETED";

    public User RecordedBy { get; set; } = null!;

    public ICollection<SaleItem> Items { get; set; }
        = new List<SaleItem>();
}