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

        // Check if there is any stock available across storage locations
        var currentStock = await _context.StockBatches
            .Where(b => b.IngredientId == id && b.Quantity > 0)
            .SumAsync(b => b.Quantity);

        if (currentStock > 0)
        {
            throw new InvalidOperationException(
                $"Cannot delete ingredient '{ingredient.Name}'. It currently has {currentStock:G29} {ingredient.Unit} of available stock in storage. Stock must be zero before deleting.");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            // Remove related stock adjustments
            var adjustments = await _context.StockAdjustments
                .Where(a => a.IngredientId == id)
                .ToListAsync();
            if (adjustments.Count != 0)
            {
                _context.StockAdjustments.RemoveRange(adjustments);
            }

            // Remove related stock movements
            var movements = await _context.StockMovements
                .Where(m => m.IngredientId == id)
                .ToListAsync();
            if (movements.Count != 0)
            {
                _context.StockMovements.RemoveRange(movements);
            }

            // Remove depleted batches from storage locations (quantity is 0)
            var batches = await _context.StockBatches
                .Where(b => b.IngredientId == id)
                .ToListAsync();
            if (batches.Count != 0)
            {
                _context.StockBatches.RemoveRange(batches);
            }

            // Remove related supplier ingredient associations if any
            var supplierIngredients = await _context.SupplierIngredients
                .Where(si => si.IngredientId == id)
                .ToListAsync();
            if (supplierIngredients.Count != 0)
            {
                _context.SupplierIngredients.RemoveRange(supplierIngredients);
            }

            // Remove related recipe ingredients if any
            var recipeIngredients = await _context.RecipeIngredients
                .Where(ri => ri.IngredientId == id)
                .ToListAsync();
            if (recipeIngredients.Count != 0)
            {
                _context.RecipeIngredients.RemoveRange(recipeIngredients);
            }

            // Permanently remove the ingredient from the database
            _context.Ingredients.Remove(ingredient);

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
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
            MaximumStockLevel = ingredient.MaximumStockLevel
        };
    }
}