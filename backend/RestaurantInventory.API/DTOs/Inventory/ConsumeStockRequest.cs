using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class ConsumeStockRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Range(0.001, double.MaxValue)]
    public decimal Quantity { get; set; }

    [StringLength(100)]
    public string? ReferenceType { get; set; }

    public Guid? ReferenceId { get; set; }

    [StringLength(500)]
    public string? Reason { get; set; }
}