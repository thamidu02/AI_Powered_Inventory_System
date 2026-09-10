using RestaurantInventory.API.DTOs.Inventory;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IIngredientService
{
    Task<List<IngredientResponse>> GetAllAsync();
    Task<IngredientResponse?> GetByIdAsync(Guid id);
    Task<IngredientResponse> CreateAsync(CreateIngredientRequest request);
    Task<IngredientResponse?> UpdateAsync(
        Guid id,
        UpdateIngredientRequest request);
    Task<bool> DeleteAsync(Guid id);
}