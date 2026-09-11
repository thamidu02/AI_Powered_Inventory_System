using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.DTOs.Sales;

namespace RestaurantInventory.API.Services.Interfaces;

public interface ISalesService
{
    Task<MenuItemResponse> CreateMenuItemAsync(
        CreateMenuItemRequest request);

    Task<MenuItemResponse?> UpdateMenuItemAsync(
        Guid menuItemId,
        UpdateMenuItemRequest request);

    Task<bool> DeleteMenuItemAsync(Guid menuItemId);

    Task<List<MenuItemResponse>> GetMenuItemsAsync();

    Task<MenuItemResponse?> GetMenuItemByIdAsync(Guid menuItemId);

    Task<RecipeResponse?> GetActiveRecipeAsync(Guid menuItemId);

    Task<List<RecipeResponse>> GetRecipesAsync();

    Task<RecipeResponse?> GetRecipeByIdAsync(Guid recipeId);

    Task<RecipeResponse> CreateRecipeAsync(CreateRecipeRequest request);

    Task<RecipeResponse?> UpdateRecipeAsync(
        Guid recipeId,
        UpdateRecipeRequest request);

    Task<bool> DeleteRecipeAsync(Guid recipeId);

    Task<List<SaleResponse>> GetSalesAsync(
        string? search = null,
        DateTime? from = null,
        DateTime? to = null,
        string sortBy = "saleDate",
        bool descending = true,
        int page = 1,
        int pageSize = 20);

    Task<SaleResponse?> GetSaleByIdAsync(Guid saleId);

    Task<SaleResponse> CreateSaleAsync(
        CreateSaleRequest request,
        Guid userId);

    Task<List<WasteRecordResponse>> GetWasteRecordsAsync(
        string? search = null,
        Guid? ingredientId = null,
        DateTime? from = null,
        DateTime? to = null,
        string sortBy = "recordedAt",
        bool descending = true,
        int page = 1,
        int pageSize = 20);

    Task<WasteRecordResponse?> GetWasteRecordByIdAsync(Guid wasteRecordId);

    Task<WasteRecordResponse> ConfirmWasteAsync(
        Guid wasteRecordId,
        Guid confirmerId);

    Task<WasteRecordResponse> RecordWasteAsync(
        RecordWasteRequest request,
        Guid userId);

    Task<SalesSummaryResponse> GetSalesSummaryAsync(
        DateTime? from = null,
        DateTime? to = null);

    Task<WasteSummaryResponse> GetWasteSummaryAsync(
        DateTime? from = null,
        DateTime? to = null);
}
