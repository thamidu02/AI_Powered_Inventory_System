using RestaurantInventory.API.DTOs.Inventory;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IInventoryService
{
    Task<List<InventoryResponse>> GetInventoryAsync();

    Task<InventoryResponse?> GetInventoryByIngredientAsync(
        Guid ingredientId);

    Task<List<InventoryResponse>> GetLowStockAsync();

    Task<List<StockBatchResponse>> GetExpiringStockAsync(
        int days);

    Task ReceiveStockAsync(
        ReceiveStockRequest request,
        Guid userId);

    Task ConsumeStockAsync(
        ConsumeStockRequest request,
        Guid userId);

    Task RecordWasteAsync(
        RecordWasteRequest request,
        Guid userId);

    Task<Guid> AdjustStockAsync(
        AdjustStockRequest request,
        Guid userId);

    Task<List<StockAdjustmentResponse>> GetAdjustmentsAsync(
        string? status = null);

    Task ApproveAdjustmentAsync(
        Guid adjustmentId,
        Guid managerId);

    Task RejectAdjustmentAsync(
        Guid adjustmentId,
        Guid managerId);

    Task TransferStockAsync(
        TransferStockRequest request,
        Guid userId);
}