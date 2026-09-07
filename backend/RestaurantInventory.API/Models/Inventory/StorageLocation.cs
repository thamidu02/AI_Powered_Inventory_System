using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Inventory;

public class StorageLocation : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? TemperatureType { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<StockBatch> StockBatches { get; set; }
        = new List<StockBatch>();
}
