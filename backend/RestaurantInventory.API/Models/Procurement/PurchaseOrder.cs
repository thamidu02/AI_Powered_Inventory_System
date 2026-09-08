using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Procurement;

public class PurchaseOrder : BaseEntity
{
    public Guid SupplierId { get; set; }

    public Guid CreatedById { get; set; }

    public Guid? ApprovedById { get; set; }

    public string Status { get; set; } = "DRAFT";

    public DateTime? OrderDate { get; set; }

    public DateTime? ExpectedDeliveryDate { get; set; }

    public decimal TotalAmount { get; set; }

    public Supplier Supplier { get; set; } = null!;

    public User CreatedBy { get; set; } = null!;

    public User? ApprovedBy { get; set; }

    public ICollection<PurchaseOrderItem> Items { get; set; }
        = new List<PurchaseOrderItem>();

    public ICollection<GoodsReceipt> GoodsReceipts { get; set; }
        = new List<GoodsReceipt>();
}