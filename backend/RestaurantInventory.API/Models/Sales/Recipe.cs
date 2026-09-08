using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.Sales;

public class Recipe : BaseEntity
{
    public Guid MenuItemId { get; set; }

    public int Version { get; set; }

    public bool IsActive { get; set; } = true;

    public MenuItem MenuItem { get; set; } = null!;

    public ICollection<RecipeIngredient> Ingredients { get; set; }
        = new List<RecipeIngredient>();
}