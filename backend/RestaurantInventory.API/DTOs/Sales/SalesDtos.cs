namespace RestaurantInventory.API.DTOs.Sales;

public class MenuItemResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal SellingPrice { get; set; }
    public bool IsActive { get; set; }
    public int RecipeCount { get; set; }
}

public class RecipeIngredientResponse
{
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public decimal QuantityRequired { get; set; }
}

public class RecipeResponse
{
    public Guid Id { get; set; }
    public Guid MenuItemId { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int Version { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public List<RecipeIngredientResponse> Ingredients { get; set; } = new();
}

public class SaleItemResponse
{
    public Guid Id { get; set; }
    public Guid MenuItemId { get; set; }
    public string MenuItemName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Subtotal { get; set; }
}

public class SaleResponse
{
    public Guid Id { get; set; }
    public Guid RecordedById { get; set; }
    public string RecordedByName { get; set; } = string.Empty;
    public DateTime SaleDate { get; set; }
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<SaleItemResponse> Items { get; set; } = new();
}

public class SalesSummaryResponse
{
    public int TotalSales { get; set; }
    public decimal TotalRevenue { get; set; }
    public decimal AverageOrderValue { get; set; }
    public int TotalItemsSold { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}

public class WasteRecordResponse
{
    public Guid Id { get; set; }
    public Guid IngredientId { get; set; }
    public string IngredientName { get; set; } = string.Empty;
    public Guid StockBatchId { get; set; }
    public string StockBatchNumber { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string Reason { get; set; } = string.Empty;
    public Guid ReportedById { get; set; }
    public string ReportedByName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime RecordedAt { get; set; }
    public Guid? ConfirmedById { get; set; }
    public string? ConfirmedByName { get; set; }
    public DateTime? ConfirmedAt { get; set; }
}

public class WasteSummaryResponse
{
    public int TotalWasteRecords { get; set; }
    public decimal TotalWasteQuantity { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}
