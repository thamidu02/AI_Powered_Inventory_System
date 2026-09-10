using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class ReceiveStockRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Required]
    public Guid StorageLocationId { get; set; }

    public Guid? GoodsReceiptId { get; set; }

    [Required]
    [StringLength(100)]
    public string BatchNumber { get; set; } = string.Empty;

    [Range(0.001, double.MaxValue)]
    public decimal Quantity { get; set; }

    [Range(0, double.MaxValue)]
    public decimal UnitCost { get; set; }

    public DateTime? ExpiryDate { get; set; }
}