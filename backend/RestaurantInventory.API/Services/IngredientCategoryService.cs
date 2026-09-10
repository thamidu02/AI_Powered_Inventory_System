using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class IngredientCategoryService : IIngredientCategoryService
{
    private readonly ApplicationDbContext _context;

    public IngredientCategoryService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<CategoryResponse>> GetAllAsync()
    {
        return await _context.IngredientCategories
            .OrderBy(c => c.Name)
            .Select(c => MapToResponse(c))
            .ToListAsync();
    }

    public async Task<CategoryResponse?> GetByIdAsync(Guid id)
    {
        var category = await _context.IngredientCategories
            .FirstOrDefaultAsync(c => c.Id == id);

        return category == null
            ? null
            : MapToResponse(category);
    }

    public async Task<CategoryResponse> CreateAsync(
        CreateCategoryRequest request)
    {
        var name = request.Name.Trim();

        var exists = await _context.IngredientCategories
            .AnyAsync(c => c.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException(
                "An ingredient category with this name already exists.");
        }

        var category = new IngredientCategory
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.IngredientCategories.Add(category);
        await _context.SaveChangesAsync();

        return MapToResponse(category);
    }

    public async Task<CategoryResponse?> UpdateAsync(
        Guid id,
        UpdateCategoryRequest request)
    {
        var category = await _context.IngredientCategories
            .FirstOrDefaultAsync(c => c.Id == id);

        if (category == null)
        {
            return null;
        }

        var name = request.Name.Trim();

        var exists = await _context.IngredientCategories
            .AnyAsync(c =>
                c.Id != id &&
                c.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException(
                "An ingredient category with this name already exists.");
        }

        category.Name = name;
        category.Description =
            string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim();

        category.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return MapToResponse(category);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var category = await _context.IngredientCategories
            .FirstOrDefaultAsync(c => c.Id == id);

        if (category == null)
        {
            return false;
        }

        var hasIngredients = await _context.Ingredients
            .AnyAsync(i => i.CategoryId == id && i.IsActive);

        if (hasIngredients)
        {
            throw new InvalidOperationException(
                "Cannot delete a category that is used by active ingredients.");
        }

        // IngredientCategory currently has no IsActive property,
        // so physical deletion is safe only when no active ingredients use it.
        _context.IngredientCategories.Remove(category);

        await _context.SaveChangesAsync();

        return true;
    }

    private static CategoryResponse MapToResponse(
        IngredientCategory category)
    {
        return new CategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            IsActive = true
        };
    }
}