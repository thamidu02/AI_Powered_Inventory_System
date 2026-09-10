using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class IngredientService : IIngredientService
{
    private readonly ApplicationDbContext _context;

    public IngredientService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<IngredientResponse>> GetAllAsync()
    {
        return await _context.Ingredients
            .Include(i => i.Category)
            .OrderBy(i => i.Name)
            .Select(i => MapToResponse(i))
            .ToListAsync();
    }

    public async Task<IngredientResponse?> GetByIdAsync(Guid id)
    {
        var ingredient = await _context.Ingredients
            .Include(i => i.Category)
            .FirstOrDefaultAsync(i => i.Id == id);

        return ingredient == null
            ? null
            : MapToResponse(ingredient);
    }

    public async Task<IngredientResponse> CreateAsync(
        CreateIngredientRequest request)
    {
        var categoryExists = await _context.IngredientCategories
            .AnyAsync(c => c.Id == request.CategoryId);

        if (!categoryExists)
        {
            throw new InvalidOperationException(
                "The specified ingredient category does not exist.");
        }

        var skuExists = await _context.Ingredients
            .AnyAsync(i => i.SKU == request.SKU);

        if (skuExists)
        {
            throw new InvalidOperationException(
                "An ingredient with this SKU already exists.");
        }

        if (request.MaximumStockLevel < request.MinimumStockLevel)
        {
            throw new InvalidOperationException(
                "Maximum stock level cannot be less than minimum stock level.");
        }

        var ingredient = new Ingredient
        {
            Id = Guid.NewGuid(),
            CategoryId = request.CategoryId,
            Name = request.Name.Trim(),
            SKU = request.SKU.Trim(),
            Unit = request.Unit.Trim(),
            MinimumStockLevel = request.MinimumStockLevel,
            MaximumStockLevel = request.MaximumStockLevel,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Ingredients.Add(ingredient);
        await _context.SaveChangesAsync();

        await _context.Entry(ingredient)
            .Reference(i => i.Category)
            .LoadAsync();

        return MapToResponse(ingredient);
    }

    public async Task<IngredientResponse?> UpdateAsync(
        Guid id,
        UpdateIngredientRequest request)
    {
        var ingredient = await _context.Ingredients
            .Include(i => i.Category)
            .FirstOrDefaultAsync(i => i.Id == id);

        if (ingredient == null)
        {
            return null;
        }

        var categoryExists = await _context.IngredientCategories
            .AnyAsync(c => c.Id == request.CategoryId);

        if (!categoryExists)
        {
            throw new InvalidOperationException(
                "The specified ingredient category does not exist.");
        }

        var skuExists = await _context.Ingredients
            .AnyAsync(i => i.SKU == request.SKU && i.Id != id);

        if (skuExists)
        {
            throw new InvalidOperationException(
                "An ingredient with this SKU already exists.");
        }

        if (request.MaximumStockLevel < request.MinimumStockLevel)
        {
            throw new InvalidOperationException(
                "Maximum stock level cannot be less than minimum stock level.");
        }

        ingredient.CategoryId = request.CategoryId;
        ingredient.Name = request.Name.Trim();
        ingredient.SKU = request.SKU.Trim();
        ingredient.Unit = request.Unit.Trim();
        ingredient.MinimumStockLevel = request.MinimumStockLevel;
        ingredient.MaximumStockLevel = request.MaximumStockLevel;
        ingredient.IsActive = request.IsActive;
        ingredient.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        await _context.Entry(ingredient)
            .Reference(i => i.Category)
            .LoadAsync();

        return MapToResponse(ingredient);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var ingredient = await _context.Ingredients
            .FirstOrDefaultAsync(i => i.Id == id);

        if (ingredient == null)
        {
            return false;
        }

        ingredient.IsActive = false;
        ingredient.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return true;
    }

    private static IngredientResponse MapToResponse(Ingredient ingredient)
    {
        return new IngredientResponse
        {
            Id = ingredient.Id,
            CategoryId = ingredient.CategoryId,
            CategoryName = ingredient.Category.Name,
            Name = ingredient.Name,
            SKU = ingredient.SKU,
            Unit = ingredient.Unit,
            MinimumStockLevel = ingredient.MinimumStockLevel,
            MaximumStockLevel = ingredient.MaximumStockLevel,
            IsActive = ingredient.IsActive
        };
    }
}