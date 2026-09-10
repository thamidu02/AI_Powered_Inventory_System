using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class CreateCategoryRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }
}