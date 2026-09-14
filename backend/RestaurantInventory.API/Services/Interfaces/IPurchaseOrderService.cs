using RestaurantInventory.API.DTOs.Procurement;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IPurchaseOrderService
{
    Task<List<PurchaseOrderResponse>> GetAllAsync(string? status = null);
    Task<PurchaseOrderResponse?> GetByIdAsync(Guid id);
    Task<PurchaseOrderResponse> CreateAsync(CreatePurchaseOrderRequest request, Guid userId);
    Task<PurchaseOrderResponse?> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, Guid userId);
    Task<PurchaseOrderResponse> SubmitAsync(Guid id, Guid userId);
    Task<PurchaseOrderResponse> ApproveAsync(Guid id, Guid approverId);
    Task<PurchaseOrderResponse> RejectAsync(Guid id, RejectPurchaseOrderRequest? request, Guid approverId);
    Task<PurchaseOrderResponse> MarkAsOrderedAsync(Guid id, Guid userId);
    Task<PurchaseOrderResponse> CancelAsync(Guid id, Guid userId);
    Task<bool> DeleteAsync(Guid id, Guid userId);
}
