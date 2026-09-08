using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Inventory;

namespace RestaurantInventory.API.Models.Sales;

public class RecipeIngredient : BaseEntity
{
    public Guid RecipeId { get; set; }

    public Guid IngredientId { get; set; }

    public decimal QuantityRequired { get; set; }

    public string Unit { get; set; } = string.Empty;

    public Recipe Recipe { get; set; } = null!;

    public Ingredient Ingredient { get; set; } = null!;
}