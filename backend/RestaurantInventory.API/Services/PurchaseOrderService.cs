using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Procurement;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class PurchaseOrderService : IPurchaseOrderService
{
    private readonly ApplicationDbContext _context;

    public PurchaseOrderService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<PurchaseOrderResponse>> GetAllAsync(string? status = null)
    {
        var query = _context.PurchaseOrders
            .AsNoTracking()
            .Include(po => po.PurchaseRequest)
            .Include(po => po.Supplier)
            .Include(po => po.CreatedBy)
            .Include(po => po.ApprovedBy)
            .Include(po => po.Items)
                .ThenInclude(item => item.Ingredient)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToUpperInvariant();
            query = query.Where(po => po.Status == normalizedStatus);
        }

        var orders = await query
            .OrderByDescending(po => po.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToResponse).ToList();
    }

    public async Task<PurchaseOrderResponse?> GetByIdAsync(Guid id)
    {
        var order = await _context.PurchaseOrders
            .AsNoTracking()
            .Include(po => po.PurchaseRequest)
            .Include(po => po.Supplier)
            .Include(po => po.CreatedBy)
            .Include(po => po.ApprovedBy)
            .Include(po => po.Items)
                .ThenInclude(item => item.Ingredient)
            .FirstOrDefaultAsync(po => po.Id == id);

        return order == null ? null : MapToResponse(order);
    }

    public async Task<PurchaseOrderResponse> CreateAsync(CreatePurchaseOrderRequest request, Guid userId)
    {
        var user = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
        {
            throw new InvalidOperationException("User not found.");
        }

        if (request.PurchaseRequestId.HasValue)
        {
            var pr = await _context.PurchaseRequests
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == request.PurchaseRequestId.Value);

            if (pr == null)
            {
                throw new InvalidOperationException("Linked Purchase Request was not found.");
            }

            if (pr.Status != "APPROVED")
            {
                throw new InvalidOperationException(
                    $"Cannot create Purchase Order from Purchase Request with status '{pr.Status}'. The Purchase Request must be in APPROVED status.");
            }
        }

        await ValidateSupplierAsync(request.SupplierId);

        var itemTuples = request.Items
            .Select(i => (i.IngredientId, i.OrderedQuantity, i.UnitPrice))
            .ToList();

        await ValidateItemsAsync(itemTuples);

        var totalAmount = Math.Round(
            request.Items.Sum(i => i.OrderedQuantity * i.UnitPrice), 2);

        var purchaseOrder = new PurchaseOrder
        {
            Id = Guid.NewGuid(),
            PurchaseRequestId = request.PurchaseRequestId,
            SupplierId = request.SupplierId,
            CreatedById = userId,
            ApprovedById = null,
            Status = "DRAFT",
            OrderDate = null,
            ExpectedDeliveryDate = request.ExpectedDeliveryDate,
            TotalAmount = totalAmount,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        foreach (var itemReq in request.Items)
        {
            purchaseOrder.Items.Add(new PurchaseOrderItem
            {
                Id = Guid.NewGuid(),
                PurchaseOrderId = purchaseOrder.Id,
                IngredientId = itemReq.IngredientId,
                OrderedQuantity = itemReq.OrderedQuantity,
                UnitPrice = Math.Round(itemReq.UnitPrice, 2),
                ReceivedQuantity = 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        _context.PurchaseOrders.Add(purchaseOrder);
        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderResponse?> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, Guid userId)
    {
        var existingOrder = await _context.PurchaseOrders
            .Include(po => po.Items)
            .FirstOrDefaultAsync(po => po.Id == id);

        if (existingOrder == null)
        {
            return null;
        }

        if (existingOrder.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Purchase order cannot be modified because its current status is '{existingOrder.Status}'. Only DRAFT purchase orders can be edited.");
        }

        if (request.PurchaseRequestId.HasValue)
        {
            var pr = await _context.PurchaseRequests
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == request.PurchaseRequestId.Value);

            if (pr == null)
            {
                throw new InvalidOperationException("Linked Purchase Request was not found.");
            }

            if (pr.Status != "APPROVED")
            {
                throw new InvalidOperationException(
                    $"Cannot link Purchase Order to Purchase Request with status '{pr.Status}'. The Purchase Request must be in APPROVED status.");
            }
        }

        await ValidateSupplierAsync(request.SupplierId);

        var itemTuples = request.Items
            .Select(i => (i.IngredientId, i.OrderedQuantity, i.UnitPrice))
            .ToList();

        await ValidateItemsAsync(itemTuples);

        var totalAmount = Math.Round(
            request.Items.Sum(i => i.OrderedQuantity * i.UnitPrice), 2);

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            existingOrder.PurchaseRequestId = request.PurchaseRequestId;
            existingOrder.SupplierId = request.SupplierId;
            existingOrder.ExpectedDeliveryDate = request.ExpectedDeliveryDate;
            existingOrder.TotalAmount = totalAmount;
            existingOrder.UpdatedAt = DateTime.UtcNow;

            _context.PurchaseOrderItems.RemoveRange(existingOrder.Items);
            existingOrder.Items.Clear();

            foreach (var itemReq in request.Items)
            {
                existingOrder.Items.Add(new PurchaseOrderItem
                {
                    Id = Guid.NewGuid(),
                    PurchaseOrderId = existingOrder.Id,
                    IngredientId = itemReq.IngredientId,
                    OrderedQuantity = itemReq.OrderedQuantity,
                    UnitPrice = Math.Round(itemReq.UnitPrice, 2),
                    ReceivedQuantity = 0,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return (await GetByIdAsync(existingOrder.Id))!;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<PurchaseOrderResponse> SubmitAsync(Guid id, Guid userId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .Include(po => po.Supplier)
            .Include(po => po.Items)
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (purchaseOrder.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Cannot submit purchase order with status '{purchaseOrder.Status}'. Only DRAFT purchase orders can be submitted for approval.");
        }

        if (purchaseOrder.Items.Count == 0)
        {
            throw new InvalidOperationException("Cannot submit a purchase order that has no items.");
        }

        if (!purchaseOrder.Supplier.IsActive)
        {
            throw new InvalidOperationException(
                $"Supplier '{purchaseOrder.Supplier.Name}' is inactive. Cannot submit purchase order for approval.");
        }

        var itemTuples = purchaseOrder.Items
            .Select(i => (i.IngredientId, i.OrderedQuantity, i.UnitPrice))
            .ToList();

        await ValidateItemsAsync(itemTuples);

        purchaseOrder.TotalAmount = Math.Round(
            purchaseOrder.Items.Sum(i => i.OrderedQuantity * i.UnitPrice), 2);
        purchaseOrder.Status = "PENDING_APPROVAL";
        purchaseOrder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderResponse> ApproveAsync(Guid id, Guid approverId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .Include(po => po.Supplier)
            .Include(po => po.Items)
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (purchaseOrder.Status != "PENDING_APPROVAL")
        {
            throw new InvalidOperationException(
                $"Cannot approve purchase order with status '{purchaseOrder.Status}'. Only PENDING_APPROVAL purchase orders can be approved.");
        }

        if (purchaseOrder.Items.Count == 0)
        {
            throw new InvalidOperationException("Cannot approve a purchase order that has no items.");
        }

        if (!purchaseOrder.Supplier.IsActive)
        {
            throw new InvalidOperationException(
                $"Supplier '{purchaseOrder.Supplier.Name}' is inactive. Cannot approve purchase order.");
        }

        purchaseOrder.Status = "APPROVED";
        purchaseOrder.ApprovedById = approverId;
        purchaseOrder.OrderDate ??= DateTime.UtcNow;
        purchaseOrder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderResponse> RejectAsync(Guid id, RejectPurchaseOrderRequest? request, Guid approverId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (purchaseOrder.Status != "PENDING_APPROVAL")
        {
            throw new InvalidOperationException(
                $"Cannot reject purchase order with status '{purchaseOrder.Status}'. Only PENDING_APPROVAL purchase orders can be rejected.");
        }

        purchaseOrder.Status = "REJECTED";
        purchaseOrder.ApprovedById = approverId;
        purchaseOrder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderResponse> MarkAsOrderedAsync(Guid id, Guid userId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (purchaseOrder.Status != "DRAFT" && purchaseOrder.Status != "APPROVED")
        {
            throw new InvalidOperationException(
                $"Cannot mark purchase order as ORDERED from status '{purchaseOrder.Status}'. Only DRAFT purchase orders can be ordered.");
        }

        purchaseOrder.Status = "ORDERED";
        purchaseOrder.OrderDate ??= DateTime.UtcNow;
        purchaseOrder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<PurchaseOrderResponse> CancelAsync(Guid id, Guid userId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (purchaseOrder.Status == "COMPLETED")
        {
            throw new InvalidOperationException("Cannot cancel a completed purchase order.");
        }

        if (purchaseOrder.Status == "CANCELLED")
        {
            throw new InvalidOperationException("Purchase order is already cancelled.");
        }

        if (purchaseOrder.Status == "REJECTED")
        {
            throw new InvalidOperationException("Cannot cancel a rejected purchase order.");
        }

        if (purchaseOrder.Status == "RECEIVED" || purchaseOrder.Status == "PARTIALLY_RECEIVED")
        {
            throw new InvalidOperationException(
                $"Cannot cancel purchase order with status '{purchaseOrder.Status}' because goods have already been received.");
        }

        purchaseOrder.Status = "CANCELLED";
        purchaseOrder.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseOrder.Id))!;
    }

    public async Task<bool> DeleteAsync(Guid id, Guid userId)
    {
        var purchaseOrder = await _context.PurchaseOrders
            .Include(po => po.Items)
            .FirstOrDefaultAsync(po => po.Id == id);

        if (purchaseOrder == null)
        {
            return false;
        }

        if (purchaseOrder.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Cannot delete purchase order with status '{purchaseOrder.Status}'. Only DRAFT purchase orders can be deleted.");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.PurchaseOrderItems.RemoveRange(purchaseOrder.Items);
            _context.PurchaseOrders.Remove(purchaseOrder);

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    // -----------------------------------------------------------------------------
    // Business Validations
    // -----------------------------------------------------------------------------

    private async Task ValidateSupplierAsync(Guid supplierId)
    {
        if (supplierId == Guid.Empty)
        {
            throw new InvalidOperationException("SupplierId is required.");
        }

        var supplier = await _context.Suppliers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == supplierId);

        if (supplier == null)
        {
            throw new InvalidOperationException($"Supplier with ID '{supplierId}' does not exist.");
        }

        if (!supplier.IsActive)
        {
            throw new InvalidOperationException(
                $"Supplier '{supplier.Name}' is inactive. Purchase orders cannot be created or updated with an inactive supplier.");
        }
    }

    private async Task ValidateItemsAsync(
        IReadOnlyList<(Guid IngredientId, decimal OrderedQuantity, decimal UnitPrice)> items)
    {
        if (items == null || items.Count == 0)
        {
            throw new InvalidOperationException("At least one item is required in the purchase order.");
        }

        var ingredientIds = items.Select(i => i.IngredientId).ToList();

        if (ingredientIds.Any(id => id == Guid.Empty))
        {
            throw new InvalidOperationException("IngredientId is required for each item.");
        }

        if (ingredientIds.Distinct().Count() != items.Count)
        {
            throw new InvalidOperationException(
                "Duplicate ingredients are not allowed within the same purchase order. Each ingredient must appear only once.");
        }

        foreach (var item in items)
        {
            if (item.OrderedQuantity <= 0)
            {
                throw new InvalidOperationException("OrderedQuantity must be greater than 0 for each item.");
            }

            if (item.UnitPrice < 0)
            {
                throw new InvalidOperationException("UnitPrice must be non-negative for each item.");
            }

            var ingredientExists = await _context.Ingredients
                .AsNoTracking()
                .AnyAsync(ing => ing.Id == item.IngredientId);

            if (!ingredientExists)
            {
                throw new InvalidOperationException($"Ingredient with ID '{item.IngredientId}' does not exist.");
            }
        }
    }

    // -----------------------------------------------------------------------------
    // Response Mapping
    // -----------------------------------------------------------------------------

    private static PurchaseOrderResponse MapToResponse(PurchaseOrder po)
    {
        return new PurchaseOrderResponse
        {
            Id = po.Id,
            PurchaseRequestId = po.PurchaseRequestId,
            PurchaseRequestReason = po.PurchaseRequest?.Reason,
            SupplierId = po.SupplierId,
            SupplierName = po.Supplier?.Name ?? string.Empty,
            Status = po.Status,
            OrderDate = po.OrderDate,
            ExpectedDeliveryDate = po.ExpectedDeliveryDate,
            TotalAmount = po.TotalAmount,
            CreatedById = po.CreatedById,
            CreatedByName = po.CreatedBy != null
                ? $"{po.CreatedBy.FirstName} {po.CreatedBy.LastName}".Trim()
                : string.Empty,
            ApprovedById = po.ApprovedById,
            ApprovedByName = po.ApprovedBy != null
                ? $"{po.ApprovedBy.FirstName} {po.ApprovedBy.LastName}".Trim()
                : null,
            CreatedAt = po.CreatedAt,
            UpdatedAt = po.UpdatedAt,
            Items = po.Items.Select(item => new PurchaseOrderItemResponse
            {
                Id = item.Id,
                PurchaseOrderId = item.PurchaseOrderId,
                IngredientId = item.IngredientId,
                IngredientName = item.Ingredient?.Name ?? string.Empty,
                IngredientUnit = item.Ingredient?.Unit ?? string.Empty,
                OrderedQuantity = item.OrderedQuantity,
                UnitPrice = item.UnitPrice,
                ReceivedQuantity = item.ReceivedQuantity,
                CreatedAt = item.CreatedAt,
                UpdatedAt = item.UpdatedAt
            }).ToList()
        };
    }
}
