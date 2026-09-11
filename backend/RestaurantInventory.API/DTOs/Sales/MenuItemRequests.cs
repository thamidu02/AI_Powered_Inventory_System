using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Sales;

public class CreateMenuItemRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Range(0, double.MaxValue)]
    public decimal SellingPrice { get; set; }
}

public class UpdateMenuItemRequest
{
    public Guid? Id { get; set; }

    [Required]
    [StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Range(0, double.MaxValue)]
    public decimal SellingPrice { get; set; }

    public bool IsActive { get; set; } = true;
}
