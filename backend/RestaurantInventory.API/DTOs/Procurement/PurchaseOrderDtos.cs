using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Procurement;

// -----------------------------------------------------------------------------
// Order Items
// -----------------------------------------------------------------------------

public class CreatePurchaseOrderItemRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Required]
    [Range(0.001, double.MaxValue, ErrorMessage = "OrderedQuantity must be greater than 0.")]
    public decimal OrderedQuantity { get; set; }

    [Required]
    [Range(0, double.MaxValue, ErrorMessage = "UnitPrice must be non-negative.")]
    public decimal UnitPrice { get; set; }
}

public class UpdatePurchaseOrderItemRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Required]
    [Range(0.001, double.MaxValue, ErrorMessage = "OrderedQuantity must be greater than 0.")]
    public decimal OrderedQuantity { get; set; }

    [Required]
    [Range(0, double.MaxValue, ErrorMessage = "UnitPrice must be non-negative.")]
    public decimal UnitPrice { get; set; }
}

// -----------------------------------------------------------------------------
// Purchase Order
// -----------------------------------------------------------------------------

public class CreatePurchaseOrderRequest
{
    public Guid? PurchaseRequestId { get; set; }

    [Required]
    public Guid SupplierId { get; set; }

    public DateTime? ExpectedDeliveryDate { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "At least one item is required.")]
    public List<CreatePurchaseOrderItemRequest> Items { get; set; } = new();
}

public class UpdatePurchaseOrderRequest
{
    public Guid? PurchaseRequestId { get; set; }

    [Required]
    public Guid SupplierId { get; set; }

    public DateTime? ExpectedDeliveryDate { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "At least one item is required.")]
    public List<UpdatePurchaseOrderItemRequest> Items { get; set; } = new();
}

public class RejectPurchaseOrderRequest
{
}

public class PurchaseOrderSummaryResponse
{
    public Guid Id { get; set; }
    public Guid SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public DateTime? OrderDate { get; set; }
    public DateTime CreatedAt { get; set; }
}

// -----------------------------------------------------------------------------
// Response
// -----------------------------------------------------------------------------

public class PurchaseOrderItemResponse
{
    public Guid Id { get; set; }
    public Guid PurchaseOrderId { get; set; }
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string IngredientUnit { get; set; } = string.Empty;
    public decimal OrderedQuantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal ReceivedQuantity { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PurchaseOrderResponse
{
    public Guid Id { get; set; }
    public Guid? PurchaseRequestId { get; set; }
    public string? PurchaseRequestReason { get; set; }
    public Guid SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? OrderDate { get; set; }
    public DateTime? ExpectedDeliveryDate { get; set; }
    public decimal TotalAmount { get; set; }
    public Guid CreatedById { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public Guid? ApprovedById { get; set; }
    public string? ApprovedByName { get; set; }
    public List<PurchaseOrderItemResponse> Items { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
