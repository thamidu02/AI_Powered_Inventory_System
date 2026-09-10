using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class RecordWasteRequest
{
    [Required]
    public Guid StockBatchId { get; set; }

    [Range(0.001, double.MaxValue)]
    public decimal Quantity { get; set; }

    [Required]
    [StringLength(100)]
    public string Reason { get; set; } = string.Empty;
}