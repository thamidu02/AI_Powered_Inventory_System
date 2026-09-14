using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Procurement;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class GoodsReceiptService : IGoodsReceiptService
{
    private readonly ApplicationDbContext _context;

    public GoodsReceiptService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<GoodsReceiptResponse>> GetAllAsync(Guid? purchaseOrderId = null)
    {
        var query = _context.GoodsReceipts
            .AsNoTracking()
            .Include(gr => gr.ReceivedBy)
            .Include(gr => gr.Items)
                .ThenInclude(gri => gri.PurchaseOrderItem)
                    .ThenInclude(poi => poi.Ingredient)
            .Include(gr => gr.Items)
                .ThenInclude(gri => gri.StorageLocation)
            .AsQueryable();

        if (purchaseOrderId.HasValue)
        {
            query = query.Where(gr => gr.PurchaseOrderId == purchaseOrderId.Value);
        }

        var receipts = await query
            .OrderByDescending(gr => gr.ReceiptDate)
            .ToListAsync();

        return receipts.Select(MapToResponse).ToList();
    }

    public async Task<GoodsReceiptResponse?> GetByIdAsync(Guid id)
    {
        var receipt = await _context.GoodsReceipts
            .AsNoTracking()
            .Include(gr => gr.ReceivedBy)
            .Include(gr => gr.Items)
                .ThenInclude(gri => gri.PurchaseOrderItem)
                    .ThenInclude(poi => poi.Ingredient)
            .Include(gr => gr.Items)
                .ThenInclude(gri => gri.StorageLocation)
            .FirstOrDefaultAsync(gr => gr.Id == id);

        return receipt == null ? null : MapToResponse(receipt);
    }

    public async Task<GoodsReceiptResponse> CreateAsync(CreateGoodsReceiptRequest request, Guid userId)
    {
        // 1. Validate user exists
        var user = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
        {
            throw new InvalidOperationException("User not found.");
        }

        if (request.Items == null || request.Items.Count == 0)
        {
            throw new InvalidOperationException("At least one item must be received.");
        }

        // 2. Prevent duplicate PurchaseOrderItemIds in single request
        var duplicateItemIds = request.Items
            .GroupBy(i => i.PurchaseOrderItemId)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        if (duplicateItemIds.Count != 0)
        {
            throw new InvalidOperationException("Duplicate items in goods receipt request are not allowed.");
        }

        // 3. Begin single atomic transaction covering GoodsReceipt, PO Items, PO Status, StockBatches, StockMovements
        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            // 4. Fetch Purchase Order with Items and Ingredients (tracked)
            var purchaseOrder = await _context.PurchaseOrders
                .Include(po => po.Items)
                    .ThenInclude(poi => poi.Ingredient)
                .FirstOrDefaultAsync(po => po.Id == request.PurchaseOrderId);

            if (purchaseOrder == null)
            {
                throw new KeyNotFoundException("Purchase order not found.");
            }

            // 5. PO eligibility check: only ORDERED or PARTIALLY_RECEIVED
            if (purchaseOrder.Status != "ORDERED" && purchaseOrder.Status != "PARTIALLY_RECEIVED")
            {
                throw new InvalidOperationException(
                    $"Cannot receive goods for purchase order with status '{purchaseOrder.Status}'. Goods can only be received for ORDERED or PARTIALLY_RECEIVED purchase orders.");
            }

            // 6. Preload and validate all requested storage locations
            var locationIds = request.Items.Select(i => i.StorageLocationId).Distinct().ToList();
            var locations = await _context.StorageLocations
                .Where(sl => locationIds.Contains(sl.Id))
                .ToDictionaryAsync(sl => sl.Id);

            foreach (var locId in locationIds)
            {
                if (!locations.TryGetValue(locId, out var location))
                {
                    throw new InvalidOperationException("Storage location not found.");
                }

                if (!location.IsActive)
                {
                    throw new InvalidOperationException(
                        $"Storage location '{location.Name}' is deactivated. No stock can be received into a deactivated storage location.");
                }
            }

            // 7. Instantiate GoodsReceipt entity
            var now = DateTime.UtcNow;
            var goodsReceipt = new GoodsReceipt
            {
                PurchaseOrderId = purchaseOrder.Id,
                ReceivedById = userId,
                ReceiptDate = now,
                Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
                CreatedAt = now,
                UpdatedAt = now
            };

            _context.GoodsReceipts.Add(goodsReceipt);

            // 8. Validate items, update PO item received quantities, create GoodsReceiptItems, StockBatches, and StockMovements
            foreach (var reqItem in request.Items)
            {
                if (reqItem.ReceivedQuantity <= 0)
                {
                    throw new InvalidOperationException("Received quantity must be greater than zero.");
                }

                if (reqItem.UnitCost.HasValue && reqItem.UnitCost.Value < 0)
                {
                    throw new InvalidOperationException("Unit cost cannot be negative.");
                }

                if (reqItem.ExpiryDate.HasValue && reqItem.ExpiryDate.Value.Date < now.Date)
                {
                    throw new InvalidOperationException("Expiry date cannot be in the past.");
                }

                // Ensure item belongs to the selected PO
                var poItem = purchaseOrder.Items.FirstOrDefault(i => i.Id == reqItem.PurchaseOrderItemId);
                if (poItem == null)
                {
                    throw new InvalidOperationException(
                        $"Purchase order item '{reqItem.PurchaseOrderItemId}' does not belong to the selected purchase order.");
                }

                var ingredient = poItem.Ingredient;
                if (ingredient == null)
                {
                    throw new InvalidOperationException("Ingredient not found for purchase order item.");
                }

                // Authoritative remaining calculation from tracked PO item
                var remaining = poItem.OrderedQuantity - poItem.ReceivedQuantity;
                if (reqItem.ReceivedQuantity > remaining)
                {
                    throw new InvalidOperationException(
                        $"Cannot receive {reqItem.ReceivedQuantity} {ingredient.Unit} of '{ingredient.Name}'. Remaining expected quantity is {remaining} {ingredient.Unit}.");
                }

                // Maximum stock level check (mirroring InventoryService logic)
                var currentStock = await _context.StockBatches
                    .Where(b =>
                        b.IngredientId == ingredient.Id &&
                        (b.Status == "AVAILABLE" || b.Status == "PARTIALLY_USED") &&
                        b.Quantity > 0)
                    .SumAsync(b => b.Quantity);

                if (ingredient.MaximumStockLevel > 0 &&
                    currentStock + reqItem.ReceivedQuantity > ingredient.MaximumStockLevel)
                {
                    throw new InvalidOperationException(
                        $"Cannot receive {reqItem.ReceivedQuantity} {ingredient.Unit} of '{ingredient.Name}'. " +
                        $"Current stock: {currentStock} {ingredient.Unit}. " +
                        $"Maximum allowed: {ingredient.MaximumStockLevel} {ingredient.Unit}. " +
                        $"This would exceed the maximum stock level by " +
                        $"{currentStock + reqItem.ReceivedQuantity - ingredient.MaximumStockLevel} {ingredient.Unit}.");
                }

                // Authoritative unit cost: fallback to PO item UnitPrice if omitted
                var effectiveUnitCost = reqItem.UnitCost ?? poItem.UnitPrice;

                // Batch number: use provided or generate clean traceable identifier
                var batchNumber = string.IsNullOrWhiteSpace(reqItem.BatchNumber)
                    ? $"GR-{now:yyyyMMdd}-{Guid.NewGuid().ToString()[..8].ToUpperInvariant()}"
                    : reqItem.BatchNumber.Trim();

                // Update PO item tracked entity
                poItem.ReceivedQuantity += reqItem.ReceivedQuantity;
                poItem.UpdatedAt = now;

                // Create GoodsReceiptItem
                var grItem = new GoodsReceiptItem
                {
                    GoodsReceipt = goodsReceipt,
                    PurchaseOrderItemId = poItem.Id,
                    StorageLocationId = reqItem.StorageLocationId,
                    BatchNumber = batchNumber,
                    ReceivedQuantity = reqItem.ReceivedQuantity,
                    UnitCost = effectiveUnitCost,
                    ExpiryDate = reqItem.ExpiryDate,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                goodsReceipt.Items.Add(grItem);

                // Create StockBatch
                var stockBatch = new StockBatch
                {
                    IngredientId = ingredient.Id,
                    StorageLocationId = reqItem.StorageLocationId,
                    GoodsReceipt = goodsReceipt,
                    BatchNumber = batchNumber,
                    Quantity = reqItem.ReceivedQuantity,
                    UnitCost = effectiveUnitCost,
                    ReceivedDate = now,
                    ExpiryDate = reqItem.ExpiryDate,
                    Status = "AVAILABLE",
                    CreatedAt = now,
                    UpdatedAt = now
                };
                _context.StockBatches.Add(stockBatch);

                // Create StockMovement
                var stockMovement = new StockMovement
                {
                    IngredientId = ingredient.Id,
                    StockBatch = stockBatch,
                    StorageLocationId = reqItem.StorageLocationId,
                    MovementType = "RECEIVE",
                    Quantity = reqItem.ReceivedQuantity,
                    ReferenceType = "GOODS_RECEIPT",
                    ReferenceId = goodsReceipt.Id,
                    CreatedById = userId,
                    Reason = $"Stock received via Goods Receipt from PO #{purchaseOrder.Id.ToString()[..8].ToUpperInvariant()}",
                    CreatedAt = now,
                    UpdatedAt = now
                };
                _context.StockMovements.Add(stockMovement);
            }

            // 9. Update Purchase Order Status
            // If every item has ReceivedQuantity >= OrderedQuantity -> COMPLETED
            // Otherwise -> PARTIALLY_RECEIVED
            var isFullyReceived = purchaseOrder.Items.All(i => i.ReceivedQuantity >= i.OrderedQuantity);
            purchaseOrder.Status = isFullyReceived ? "COMPLETED" : "PARTIALLY_RECEIVED";
            purchaseOrder.UpdatedAt = now;

            // 10. Persist all changes atomically
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            // 11. Return created GoodsReceipt
            return (await GetByIdAsync(goodsReceipt.Id))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static GoodsReceiptResponse MapToResponse(GoodsReceipt receipt)
    {
        return new GoodsReceiptResponse
        {
            Id = receipt.Id,
            PurchaseOrderId = receipt.PurchaseOrderId,
            ReceivedById = receipt.ReceivedById,
            ReceivedByName = receipt.ReceivedBy != null
                ? $"{receipt.ReceivedBy.FirstName} {receipt.ReceivedBy.LastName}".Trim()
                : string.Empty,
            ReceiptDate = receipt.ReceiptDate,
            Notes = receipt.Notes,
            CreatedAt = receipt.CreatedAt,
            Items = receipt.Items.Select(item => new GoodsReceiptItemResponse
            {
                Id = item.Id,
                GoodsReceiptId = item.GoodsReceiptId,
                PurchaseOrderItemId = item.PurchaseOrderItemId,
                IngredientId = item.PurchaseOrderItem?.IngredientId ?? Guid.Empty,
                IngredientName = item.PurchaseOrderItem?.Ingredient?.Name ?? string.Empty,
                IngredientUnit = item.PurchaseOrderItem?.Ingredient?.Unit ?? string.Empty,
                StorageLocationId = item.StorageLocationId,
                StorageLocationName = item.StorageLocation?.Name ?? string.Empty,
                BatchNumber = item.BatchNumber,
                ReceivedQuantity = item.ReceivedQuantity,
                UnitCost = item.UnitCost,
                ExpiryDate = item.ExpiryDate,
                CreatedAt = item.CreatedAt
            }).ToList()
        };
    }
}
