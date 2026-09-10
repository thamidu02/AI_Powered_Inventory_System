using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Inventory;

public class CreateStorageLocationRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }

    [StringLength(50)]
    public string? TemperatureType { get; set; }
}