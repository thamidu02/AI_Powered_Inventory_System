namespace RestaurantInventory.API.DTOs.Inventory;

public class InventoryResponse
{
    public Guid IngredientId { get; set; }

    public string IngredientName { get; set; } = string.Empty;

    public string SKU { get; set; } = string.Empty;

    public string Unit { get; set; } = string.Empty;

    public decimal CurrentStock { get; set; }

    public decimal MinimumStockLevel { get; set; }

    public decimal MaximumStockLevel { get; set; }

    public bool IsLowStock { get; set; }

    public List<StockBatchResponse> Batches { get; set; } = new();
}

public class StockBatchResponse
{
    public Guid Id { get; set; }

    // Ingredient context (populated by expiring-stock and mapping helpers)
    public Guid IngredientId { get; set; }

    public string IngredientName { get; set; } = string.Empty;

    public string BatchNumber { get; set; } = string.Empty;

    public decimal Quantity { get; set; }

    public decimal UnitCost { get; set; }

    public DateTime ReceivedDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public string Status { get; set; } = string.Empty;

    public Guid StorageLocationId { get; set; }

    public string StorageLocationName { get; set; } = string.Empty;
}