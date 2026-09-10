using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class TransferStockRequest
{
    [Required]
    public Guid StockBatchId { get; set; }

    [Required]
    public Guid DestinationStorageLocationId { get; set; }

    [Range(0.001, double.MaxValue)]
    public decimal Quantity { get; set; }
}