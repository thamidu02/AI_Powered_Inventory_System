using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Sales;

public class CreateSaleRequest
{
    [Required]
    public List<CreateSaleItemRequest> Items { get; set; } = new();
}

public class CreateSaleItemRequest
{
    [Required]
    public Guid MenuItemId { get; set; }

    [Range(1, int.MaxValue)]
    public int Quantity { get; set; }
}
