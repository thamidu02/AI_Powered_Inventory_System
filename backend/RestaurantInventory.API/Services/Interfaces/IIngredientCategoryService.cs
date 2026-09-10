using RestaurantInventory.API.DTOs.Inventory;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IIngredientCategoryService
{
    Task<List<CategoryResponse>> GetAllAsync();
    Task<CategoryResponse?> GetByIdAsync(Guid id);
    Task<CategoryResponse> CreateAsync(CreateCategoryRequest request);
    Task<CategoryResponse?> UpdateAsync(
        Guid id,
        UpdateCategoryRequest request);
    Task<bool> DeleteAsync(Guid id);
}