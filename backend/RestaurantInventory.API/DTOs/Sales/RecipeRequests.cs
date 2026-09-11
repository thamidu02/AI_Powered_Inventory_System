using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.Sales;

public class RecipeIngredientRequest
{
    [Required]
    public Guid IngredientId { get; set; }

    [Range(typeof(decimal), "0.000001", "79228162514264337593543950335")]
    public decimal QuantityRequired { get; set; }

    [StringLength(50)]
    public string? Unit { get; set; }
}

public class CreateRecipeRequest
{
    [Required]
    public Guid MenuItemId { get; set; }

    [Range(1, int.MaxValue)]
    public int Version { get; set; } = 1;

    public bool IsActive { get; set; } = true;

    [MinLength(1)]
    public List<RecipeIngredientRequest> Ingredients { get; set; } = new();
}

public class UpdateRecipeRequest : CreateRecipeRequest
{
}
