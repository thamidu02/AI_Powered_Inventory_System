namespace RestaurantInventory.API.DTOs.Inventory;

public class StockAdjustmentResponse
{
    public Guid Id { get; set; }

    public Guid IngredientId { get; set; }

    public string IngredientName { get; set; } = string.Empty;

    public Guid StockBatchId { get; set; }

    public string BatchNumber { get; set; } = string.Empty;

    public decimal QuantityChange { get; set; }

    public string Reason { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public Guid RequestedById { get; set; }

    public string RequestedByName { get; set; } = string.Empty;

    public Guid? ApprovedById { get; set; }

    public string? ApprovedByName { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public DateTime CreatedAt { get; set; }
}
