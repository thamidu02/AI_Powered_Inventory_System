using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Procurement;

public class GoodsReceipt : BaseEntity
{
    public Guid PurchaseOrderId { get; set; }

    public Guid ReceivedById { get; set; }

    public DateTime ReceiptDate { get; set; } = DateTime.UtcNow;

    public string? Notes { get; set; }

    public PurchaseOrder PurchaseOrder { get; set; } = null!;

    public User ReceivedBy { get; set; } = null!;

    public ICollection<GoodsReceiptItem> Items { get; set; }
        = new List<GoodsReceiptItem>();
}