using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Inventory;

public class IngredientCategory : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public ICollection<Ingredient> Ingredients { get; set; } = new List<Ingredient>();
}