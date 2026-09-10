namespace RestaurantInventory.API.DTOs.Inventory;

public class StorageLocationResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? TemperatureType { get; set; }
    public bool IsActive { get; set; }
}