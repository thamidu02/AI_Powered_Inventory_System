using RestaurantInventory.API.DTOs.Inventory;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IStorageLocationService
{
    Task<List<StorageLocationResponse>> GetAllAsync();
    Task<StorageLocationResponse?> GetByIdAsync(Guid id);
    Task<StorageLocationResponse> CreateAsync(
        CreateStorageLocationRequest request);
    Task<StorageLocationResponse?> UpdateAsync(
        Guid id,
        UpdateStorageLocationRequest request);
    Task<bool> DeleteAsync(Guid id);
}