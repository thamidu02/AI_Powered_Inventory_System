using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Procurement;

// -----------------------------------------------------------------------------
// Goods Receipt Items
// -----------------------------------------------------------------------------

public class CreateGoodsReceiptItemRequest
{
    [Required]
    public Guid PurchaseOrderItemId { get; set; }

    [Required]
    public Guid StorageLocationId { get; set; }

    [Required]
    [Range(0.001, double.MaxValue, ErrorMessage = "ReceivedQuantity must be greater than 0.")]
    public decimal ReceivedQuantity { get; set; }

    [Range(0, double.MaxValue, ErrorMessage = "UnitCost must be non-negative.")]
    public decimal? UnitCost { get; set; }

    [StringLength(100)]
    public string? BatchNumber { get; set; }

    public DateTime? ExpiryDate { get; set; }
}

// -----------------------------------------------------------------------------
// Goods Receipt
// -----------------------------------------------------------------------------

public class CreateGoodsReceiptRequest
{
    [Required]
    public Guid PurchaseOrderId { get; set; }

    [StringLength(500)]
    public string? Notes { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "At least one item must be received.")]
    public List<CreateGoodsReceiptItemRequest> Items { get; set; } = new();
}

// -----------------------------------------------------------------------------
// Response Models
// -----------------------------------------------------------------------------

public class GoodsReceiptItemResponse
{
    public Guid Id { get; set; }
    public Guid GoodsReceiptId { get; set; }
    public Guid PurchaseOrderItemId { get; set; }
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string IngredientUnit { get; set; } = string.Empty;
    public Guid StorageLocationId { get; set; }
    public string StorageLocationName { get; set; } = string.Empty;
    public string BatchNumber { get; set; } = string.Empty;
    public decimal ReceivedQuantity { get; set; }
    public decimal UnitCost { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class GoodsReceiptResponse
{
    public Guid Id { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public Guid ReceivedById { get; set; }
    public string ReceivedByName { get; set; } = string.Empty;
    public DateTime ReceiptDate { get; set; }
    public string? Notes { get; set; }
    public List<GoodsReceiptItemResponse> Items { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}
