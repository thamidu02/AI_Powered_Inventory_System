namespace RestaurantInventory.API.DTOs.Inventory;

public class StockMovementResponse
{
    public Guid Id { get; set; }

    public Guid IngredientId { get; set; }

    public string IngredientName { get; set; } = string.Empty;

    public string SKU { get; set; } = string.Empty;

    public string Unit { get; set; } = string.Empty;

    public Guid StockBatchId { get; set; }

    public string BatchNumber { get; set; } = string.Empty;

    public Guid StorageLocationId { get; set; }

    public string StorageLocationName { get; set; } = string.Empty;

    public string MovementType { get; set; } = string.Empty;

    public decimal Quantity { get; set; }

    public string? ReferenceType { get; set; }

    public Guid? ReferenceId { get; set; }

    public string? Reason { get; set; }

    public Guid CreatedById { get; set; }

    public string CreatedByName { get; set; } = string.Empty;

    public string CreatedByEmail { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
