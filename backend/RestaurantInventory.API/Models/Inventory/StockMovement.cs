using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.Inventory;

public class StockMovement : BaseEntity
{
    public Guid IngredientId { get; set; }

    public Guid StockBatchId { get; set; }

    public Guid StorageLocationId { get; set; }

    public string MovementType { get; set; } = string.Empty;

    public decimal Quantity { get; set; }

    public string? ReferenceType { get; set; }

    public Guid? ReferenceId { get; set; }

    public string? Reason { get; set; }

    public Guid CreatedById { get; set; }

    public Ingredient Ingredient { get; set; } = null!;

    public StockBatch StockBatch { get; set; } = null!;

    public StorageLocation StorageLocation { get; set; } = null!;

    public User CreatedBy { get; set; } = null!;
}