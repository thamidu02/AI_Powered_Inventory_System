using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class UpdateIngredientRequest
{
    [Required]
    public Guid CategoryId { get; set; }

    [Required]
    [StringLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [StringLength(50)]
    public string SKU { get; set; } = string.Empty;

    [Required]
    [StringLength(30)]
    public string Unit { get; set; } = string.Empty;

    [Range(0, double.MaxValue)]
    public decimal MinimumStockLevel { get; set; }

    [Range(0, double.MaxValue)]
    public decimal MaximumStockLevel { get; set; }

    public bool IsActive { get; set; } = true;
}