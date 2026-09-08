using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Procurement;

public class PurchaseRequest : BaseEntity
{
    public Guid RequestedById { get; set; }

    public string Status { get; set; } = "DRAFT";

    public string? Reason { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public Guid? ApprovedById { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public User RequestedBy { get; set; } = null!;

    public User? ApprovedBy { get; set; }

    public ICollection<PurchaseRequestItem> Items { get; set; }
        = new List<PurchaseRequestItem>();
}