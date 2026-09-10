using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class AdjustStockRequest
{
    [Required]
    public Guid StockBatchId { get; set; }

    // Positive = increase
    // Negative = decrease
    [Range(-999999999, 999999999)]
    public decimal QuantityChange { get; set; }

    [Required]
    [StringLength(500)]
    public string Reason { get; set; } = string.Empty;
}