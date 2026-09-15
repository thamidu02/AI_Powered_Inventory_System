using RestaurantInventory.API.DTOs.Procurement;

namespace RestaurantInventory.API.Services.Interfaces;

public interface ISupplierService
{
    Task<List<SupplierResponse>> GetAllAsync();
    Task<SupplierResponse?> GetByIdAsync(Guid id);
    Task<SupplierResponse> CreateAsync(CreateSupplierRequest request);
    Task<SupplierResponse?> UpdateAsync(Guid id, UpdateSupplierRequest request);
    Task<bool> DeleteAsync(Guid id);
}
