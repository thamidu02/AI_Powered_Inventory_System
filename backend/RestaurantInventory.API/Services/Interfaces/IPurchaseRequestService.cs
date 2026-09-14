using RestaurantInventory.API.DTOs.Procurement;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IPurchaseRequestService
{
    Task<List<PurchaseRequestResponse>> GetAllAsync(string? status = null);

    Task<PurchaseRequestResponse?> GetByIdAsync(Guid id);

    Task<PurchaseRequestResponse> CreateAsync(CreatePurchaseRequestRequest request, Guid userId);

    Task<PurchaseRequestResponse?> UpdateAsync(Guid id, UpdatePurchaseRequestRequest request, Guid userId);

    Task<PurchaseRequestResponse> SubmitAsync(Guid id, Guid userId);

    Task<PurchaseRequestResponse> ApproveAsync(Guid id, Guid approverId);

    Task<PurchaseRequestResponse> RejectAsync(Guid id, RejectPurchaseRequestRequest request, Guid approverId);

    Task<PurchaseRequestResponse> CancelAsync(Guid id, Guid userId);

    Task<bool> DeleteAsync(Guid id, Guid userId);
}
