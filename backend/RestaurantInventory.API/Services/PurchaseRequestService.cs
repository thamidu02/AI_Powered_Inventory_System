using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Procurement;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class PurchaseRequestService : IPurchaseRequestService
{
    private readonly ApplicationDbContext _context;

    public PurchaseRequestService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<PurchaseRequestResponse>> GetAllAsync(string? status = null)
    {
        var query = _context.PurchaseRequests
            .AsNoTracking()
            .Include(pr => pr.RequestedBy)
            .Include(pr => pr.ApprovedBy)
            .Include(pr => pr.Items)
                .ThenInclude(item => item.Ingredient)
            .Include(pr => pr.Items)
                .ThenInclude(item => item.SuggestedSupplier)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = status.Trim().ToUpperInvariant();
            query = query.Where(pr => pr.Status == normalizedStatus);
        }

        var requests = await query
            .OrderByDescending(pr => pr.RequestedAt)
            .ToListAsync();

        return requests.Select(MapToResponse).ToList();
    }

    public async Task<PurchaseRequestResponse?> GetByIdAsync(Guid id)
    {
        var request = await _context.PurchaseRequests
            .AsNoTracking()
            .Include(pr => pr.RequestedBy)
            .Include(pr => pr.ApprovedBy)
            .Include(pr => pr.Items)
                .ThenInclude(item => item.Ingredient)
            .Include(pr => pr.Items)
                .ThenInclude(item => item.SuggestedSupplier)
            .FirstOrDefaultAsync(pr => pr.Id == id);

        return request == null ? null : MapToResponse(request);
    }

    public async Task<PurchaseRequestResponse> CreateAsync(CreatePurchaseRequestRequest request, Guid userId)
    {
        var user = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
        {
            throw new InvalidOperationException("User not found.");
        }

        await ValidateItemsAsync(request.Items);

        var purchaseRequest = new PurchaseRequest
        {
            Id = Guid.NewGuid(),
            RequestedById = userId,
            Status = "DRAFT",
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim(),
            RequestedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        foreach (var itemReq in request.Items)
        {
            purchaseRequest.Items.Add(new PurchaseRequestItem
            {
                Id = Guid.NewGuid(),
                PurchaseRequestId = purchaseRequest.Id,
                IngredientId = itemReq.IngredientId,
                RequestedQuantity = itemReq.RequestedQuantity,
                SuggestedSupplierId = itemReq.SuggestedSupplierId,
                Notes = string.IsNullOrWhiteSpace(itemReq.Notes) ? null : itemReq.Notes.Trim(),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        _context.PurchaseRequests.Add(purchaseRequest);
        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseRequest.Id))!;
    }

    public async Task<PurchaseRequestResponse?> UpdateAsync(Guid id, UpdatePurchaseRequestRequest request, Guid userId)
    {
        var existingRequest = await _context.PurchaseRequests
            .Include(pr => pr.Items)
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (existingRequest == null)
        {
            return null;
        }

        if (existingRequest.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Purchase request cannot be modified because its current status is '{existingRequest.Status}'. Only DRAFT requests can be edited.");
        }

        await ValidateItemsAsync(request.Items);

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.PurchaseRequestItems.RemoveRange(existingRequest.Items);

            existingRequest.Reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
            existingRequest.UpdatedAt = DateTime.UtcNow;

            existingRequest.Items = request.Items.Select(itemReq => new PurchaseRequestItem
            {
                Id = Guid.NewGuid(),
                PurchaseRequestId = existingRequest.Id,
                IngredientId = itemReq.IngredientId,
                RequestedQuantity = itemReq.RequestedQuantity,
                SuggestedSupplierId = itemReq.SuggestedSupplierId,
                Notes = string.IsNullOrWhiteSpace(itemReq.Notes) ? null : itemReq.Notes.Trim(),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            }).ToList();

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        return (await GetByIdAsync(existingRequest.Id))!;
    }

    public async Task<PurchaseRequestResponse> SubmitAsync(Guid id, Guid userId)
    {
        var purchaseRequest = await _context.PurchaseRequests
            .Include(pr => pr.Items)
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (purchaseRequest == null)
        {
            throw new KeyNotFoundException("Purchase request not found.");
        }

        if (purchaseRequest.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Only DRAFT purchase requests can be submitted. Current status: '{purchaseRequest.Status}'.");
        }

        if (purchaseRequest.Items.Count == 0)
        {
            throw new InvalidOperationException("Purchase request must contain at least one item before submission.");
        }

        purchaseRequest.Status = "PENDING_APPROVAL";
        purchaseRequest.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseRequest.Id))!;
    }

    public async Task<PurchaseRequestResponse> ApproveAsync(Guid id, Guid approverId)
    {
        var purchaseRequest = await _context.PurchaseRequests
            .Include(pr => pr.Items)
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (purchaseRequest == null)
        {
            throw new KeyNotFoundException("Purchase request not found.");
        }

        if (purchaseRequest.Status != "PENDING_APPROVAL")
        {
            throw new InvalidOperationException(
                $"Cannot approve a purchase request with status '{purchaseRequest.Status}'. Only PENDING_APPROVAL purchase requests can be approved.");
        }

        if (purchaseRequest.Items.Count == 0)
        {
            throw new InvalidOperationException("Cannot approve a purchase request that has no items.");
        }

        purchaseRequest.Status = "APPROVED";
        purchaseRequest.ApprovedById = approverId;
        purchaseRequest.ApprovedAt = DateTime.UtcNow;
        purchaseRequest.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseRequest.Id))!;
    }

    public async Task<PurchaseRequestResponse> RejectAsync(Guid id, RejectPurchaseRequestRequest request, Guid approverId)
    {
        var purchaseRequest = await _context.PurchaseRequests
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (purchaseRequest == null)
        {
            throw new KeyNotFoundException("Purchase request not found.");
        }

        if (purchaseRequest.Status == "APPROVED")
        {
            throw new InvalidOperationException("Cannot reject an already approved purchase request.");
        }

        if (purchaseRequest.Status == "CANCELLED")
        {
            throw new InvalidOperationException("Cannot reject a cancelled purchase request.");
        }

        if (purchaseRequest.Status == "REJECTED")
        {
            throw new InvalidOperationException("Purchase request is already rejected.");
        }

        purchaseRequest.Status = "REJECTED";
        purchaseRequest.ApprovedById = approverId;
        purchaseRequest.ApprovedAt = DateTime.UtcNow;
        purchaseRequest.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(request.Reason))
        {
            var rejectionNote = $"[Rejection Reason: {request.Reason.Trim()}]";
            purchaseRequest.Reason = string.IsNullOrWhiteSpace(purchaseRequest.Reason)
                ? rejectionNote
                : $"{purchaseRequest.Reason} {rejectionNote}";
        }

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseRequest.Id))!;
    }

    public async Task<PurchaseRequestResponse> CancelAsync(Guid id, Guid userId)
    {
        var purchaseRequest = await _context.PurchaseRequests
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (purchaseRequest == null)
        {
            throw new KeyNotFoundException("Purchase request not found.");
        }

        if (purchaseRequest.Status == "APPROVED")
        {
            throw new InvalidOperationException("Cannot cancel an already approved purchase request.");
        }

        if (purchaseRequest.Status == "CANCELLED")
        {
            throw new InvalidOperationException("Purchase request is already cancelled.");
        }

        purchaseRequest.Status = "CANCELLED";
        purchaseRequest.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return (await GetByIdAsync(purchaseRequest.Id))!;
    }

    public async Task<bool> DeleteAsync(Guid id, Guid userId)
    {
        var purchaseRequest = await _context.PurchaseRequests
            .Include(pr => pr.Items)
            .FirstOrDefaultAsync(pr => pr.Id == id);

        if (purchaseRequest == null)
        {
            return false;
        }

        if (purchaseRequest.Status != "DRAFT")
        {
            throw new InvalidOperationException(
                $"Cannot delete purchase request with status '{purchaseRequest.Status}'. Only DRAFT requests can be deleted.");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.PurchaseRequestItems.RemoveRange(purchaseRequest.Items);
            _context.PurchaseRequests.Remove(purchaseRequest);

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

    // ─── Private Validation Helpers ──────────────────────────────────────────

    private async Task ValidateItemsAsync<TItem>(IReadOnlyCollection<TItem>? items)
        where TItem : class
    {
        if (items == null || items.Count == 0)
        {
            throw new InvalidOperationException("Purchase request must contain at least one item.");
        }

        var itemTuples = items.Select(item =>
        {
            return item switch
            {
                CreatePurchaseRequestItemRequest c => (c.IngredientId, c.RequestedQuantity, c.SuggestedSupplierId),
                UpdatePurchaseRequestItemRequest u => (u.IngredientId, u.RequestedQuantity, u.SuggestedSupplierId),
                _ => throw new InvalidOperationException("Unsupported item request type.")
            };
        }).ToList();

        var duplicateIngredient = itemTuples
            .GroupBy(i => i.IngredientId)
            .FirstOrDefault(g => g.Count() > 1);

        if (duplicateIngredient != null)
        {
            throw new InvalidOperationException(
                "Each ingredient can appear only once in a purchase request. Combine quantities if necessary.");
        }

        foreach (var (_, quantity, _) in itemTuples)
        {
            if (quantity <= 0)
            {
                throw new InvalidOperationException("Requested quantity must be greater than zero.");
            }
        }

        var ingredientIds = itemTuples.Select(i => i.IngredientId).Distinct().ToList();
        var existingIngredients = await _context.Ingredients
            .AsNoTracking()
            .Where(i => ingredientIds.Contains(i.Id))
            .Select(i => i.Id)
            .ToListAsync();

        var missingIngredientIds = ingredientIds.Except(existingIngredients).ToList();
        if (missingIngredientIds.Count > 0)
        {
            throw new InvalidOperationException(
                $"Ingredient with ID '{missingIngredientIds[0]}' does not exist.");
        }

        var supplierIds = itemTuples
            .Where(i => i.SuggestedSupplierId.HasValue)
            .Select(i => i.SuggestedSupplierId!.Value)
            .Distinct()
            .ToList();

        if (supplierIds.Count > 0)
        {
            var suppliers = await _context.Suppliers
                .AsNoTracking()
                .Where(s => supplierIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id);

            foreach (var sId in supplierIds)
            {
                if (!suppliers.TryGetValue(sId, out var supplier))
                {
                    throw new InvalidOperationException(
                        $"Suggested supplier with ID '{sId}' does not exist.");
                }

                if (!supplier.IsActive)
                {
                    throw new InvalidOperationException(
                        $"Suggested supplier '{supplier.Name}' is deactivated. Only active suppliers can be selected.");
                }
            }
        }
    }

    // ─── Response Mapping ───────────────────────────────────────────────────

    private static PurchaseRequestResponse MapToResponse(PurchaseRequest pr)
    {
        return new PurchaseRequestResponse
        {
            Id = pr.Id,
            Status = pr.Status,
            Reason = pr.Reason,
            RequestedAt = pr.RequestedAt,
            RequestedById = pr.RequestedById,
            RequestedByName = pr.RequestedBy != null
                ? $"{pr.RequestedBy.FirstName} {pr.RequestedBy.LastName}".Trim()
                : string.Empty,
            ApprovedById = pr.ApprovedById,
            ApprovedByName = pr.ApprovedBy != null
                ? $"{pr.ApprovedBy.FirstName} {pr.ApprovedBy.LastName}".Trim()
                : null,
            ApprovedAt = pr.ApprovedAt,
            CreatedAt = pr.CreatedAt,
            UpdatedAt = pr.UpdatedAt,
            Items = pr.Items.Select(item => new PurchaseRequestItemResponse
            {
                Id = item.Id,
                PurchaseRequestId = item.PurchaseRequestId,
                IngredientId = item.IngredientId,
                IngredientName = item.Ingredient?.Name ?? string.Empty,
                IngredientUnit = item.Ingredient?.Unit ?? string.Empty,
                RequestedQuantity = item.RequestedQuantity,
                SuggestedSupplierId = item.SuggestedSupplierId,
                SuggestedSupplierName = item.SuggestedSupplier?.Name,
                Notes = item.Notes,
                CreatedAt = item.CreatedAt,
                UpdatedAt = item.UpdatedAt
            }).ToList()
        };
    }
}
