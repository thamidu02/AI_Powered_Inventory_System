using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Procurement;

public class GoodsReceiptItem : BaseEntity
{
    public Guid GoodsReceiptId { get; set; }

    public Guid PurchaseOrderItemId { get; set; }

    public string BatchNumber { get; set; } = string.Empty;

    public decimal ReceivedQuantity { get; set; }

    public decimal UnitCost { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public Guid StorageLocationId { get; set; }

    public GoodsReceipt GoodsReceipt { get; set; } = null!;

    public PurchaseOrderItem PurchaseOrderItem { get; set; } = null!;

    public StorageLocation StorageLocation { get; set; } = null!;
}