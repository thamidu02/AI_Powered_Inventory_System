using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Procurement;

public class PurchaseOrderItem : BaseEntity
{
    public Guid PurchaseOrderId { get; set; }

    public Guid IngredientId { get; set; }

    public decimal OrderedQuantity { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal ReceivedQuantity { get; set; }

    public PurchaseOrder PurchaseOrder { get; set; } = null!;

    public Ingredient Ingredient { get; set; } = null!;

    public ICollection<GoodsReceiptItem> GoodsReceiptItems { get; set; }
        = new List<GoodsReceiptItem>();
}