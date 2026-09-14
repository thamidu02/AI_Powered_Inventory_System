using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Procurement;

// ─── Request Items ───────────────────────────────────────────────────────────

public class CreatePurchaseRequestItemRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Required]
    [Range(0.001, double.MaxValue, ErrorMessage = "RequestedQuantity must be greater than 0.")]
    public decimal RequestedQuantity { get; set; }

    public Guid? SuggestedSupplierId { get; set; }

    [StringLength(500)]
    public string? Notes { get; set; }
}

public class UpdatePurchaseRequestItemRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Required]
    [Range(0.001, double.MaxValue, ErrorMessage = "RequestedQuantity must be greater than 0.")]
    public decimal RequestedQuantity { get; set; }

    public Guid? SuggestedSupplierId { get; set; }

    [StringLength(500)]
    public string? Notes { get; set; }
}

// ─── Purchase Request ─────────────────────────────────────────────────────────

public class CreatePurchaseRequestRequest
{
    [StringLength(1000)]
    public string? Reason { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "At least one item is required.")]
    public List<CreatePurchaseRequestItemRequest> Items { get; set; } = new();
}

public class UpdatePurchaseRequestRequest
{
    [StringLength(1000)]
    public string? Reason { get; set; }

    [Required]
    [MinLength(1, ErrorMessage = "At least one item is required.")]
    public List<UpdatePurchaseRequestItemRequest> Items { get; set; } = new();
}

public class RejectPurchaseRequestRequest
{
    [StringLength(1000)]
    public string? Reason { get; set; }
}

// ─── Response ─────────────────────────────────────────────────────────────────

public class PurchaseRequestItemResponse
{
    public Guid Id { get; set; }
    public Guid PurchaseRequestId { get; set; }
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string IngredientUnit { get; set; } = string.Empty;
    public decimal RequestedQuantity { get; set; }
    public Guid? SuggestedSupplierId { get; set; }
    public string? SuggestedSupplierName { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PurchaseRequestResponse
{
    public Guid Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime RequestedAt { get; set; }
    public Guid RequestedById { get; set; }
    public string RequestedByName { get; set; } = string.Empty;
    public Guid? ApprovedById { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public List<PurchaseRequestItemResponse> Items { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
