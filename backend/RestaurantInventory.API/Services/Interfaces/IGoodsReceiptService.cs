using RestaurantInventory.API.DTOs.Procurement;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IGoodsReceiptService
{
    Task<List<GoodsReceiptResponse>> GetAllAsync(Guid? purchaseOrderId = null);

    Task<GoodsReceiptResponse?> GetByIdAsync(Guid id);

    Task<GoodsReceiptResponse> CreateAsync(CreateGoodsReceiptRequest request, Guid userId);
}
