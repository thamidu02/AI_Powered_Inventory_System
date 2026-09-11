using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class InventoryService : IInventoryService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;

    public InventoryService(
        ApplicationDbContext context,
        IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    // ============================================================
    // GET INVENTORY
    // ============================================================

    public async Task<List<InventoryResponse>> GetInventoryAsync()
    {
        var ingredients = await _context.Ingredients
            .AsNoTracking()
            .Include(i => i.StockBatches)
                .ThenInclude(b => b.StorageLocation)
            .OrderBy(i => i.Name)
            .ToListAsync();

        return ingredients.Select(MapInventory).ToList();
    }


    // ============================================================
    // GET INVENTORY BY INGREDIENT
    // ============================================================

    public async Task<InventoryResponse?> GetInventoryByIngredientAsync(
        Guid ingredientId)
    {
        var ingredient = await _context.Ingredients
            .AsNoTracking()
            .Include(i => i.StockBatches)
                .ThenInclude(b => b.StorageLocation)
            .FirstOrDefaultAsync(i => i.Id == ingredientId);

        return ingredient == null
            ? null
            : MapInventory(ingredient);
    }


    // ============================================================
    // LOW STOCK
    // ============================================================

    public async Task<List<InventoryResponse>> GetLowStockAsync()
    {
        var inventory = await GetInventoryAsync();

        return inventory
            .Where(x => x.IsLowStock)
            .ToList();
    }


    // ============================================================
    // EXPIRING STOCK
    // ============================================================

    public async Task<List<StockBatchResponse>> GetExpiringStockAsync(
        int days)
    {
        if (days < 0)
            throw new ArgumentException(
                "Days cannot be negative.");

        var today = DateTime.UtcNow.Date;
        var expiryLimit = today.AddDays(days);

        return await _context.StockBatches
            .AsNoTracking()
            .Include(b => b.StorageLocation)
            .Where(b =>
                (b.Status == "AVAILABLE" || b.Status == "PARTIALLY_USED") &&
                b.Quantity > 0 &&
                b.ExpiryDate.HasValue &&
                b.ExpiryDate.Value.Date >= today &&
                b.ExpiryDate.Value.Date <= expiryLimit)
            .OrderBy(b => b.ExpiryDate)
            .Select(b => new StockBatchResponse
            {
                Id = b.Id,
                BatchNumber = b.BatchNumber,
                Quantity = b.Quantity,
                UnitCost = b.UnitCost,
                ReceivedDate = b.ReceivedDate,
                ExpiryDate = b.ExpiryDate,
                Status = b.Status,
                StorageLocationId = b.StorageLocationId,
                StorageLocationName = b.StorageLocation.Name
            })
            .ToListAsync();
    }


    // ============================================================
    // RECEIVE STOCK
    // ============================================================

    public async Task ReceiveStockAsync(
        ReceiveStockRequest request,
        Guid userId)
    {
        var ingredient = await _context.Ingredients
            .FirstOrDefaultAsync(i => i.Id == request.IngredientId);

        if (ingredient == null)
            throw new InvalidOperationException(
                "Ingredient not found.");

        var location = await _context.StorageLocations
            .FirstOrDefaultAsync(x => x.Id == request.StorageLocationId);

        if (location == null)
            throw new InvalidOperationException(
                "Storage location not found.");

        if (!location.IsActive)
            throw new InvalidOperationException(
                $"Storage location '{location.Name}' is deactivated. No stock can be received or added into a deactivated storage location.");

        if (request.Quantity <= 0)
            throw new InvalidOperationException(
                "Received quantity must be greater than zero.");

        if (request.UnitCost < 0)
            throw new InvalidOperationException(
                "Unit cost cannot be negative.");

        if (request.ExpiryDate.HasValue &&
            request.ExpiryDate.Value.Date < DateTime.UtcNow.Date)
        {
            throw new InvalidOperationException(
                "Expiry date cannot be in the past.");
        }

        // If a GoodsReceipt is supplied, make sure it exists.
        if (request.GoodsReceiptId.HasValue)
        {
            var receiptExists = await _context.GoodsReceipts
                .AnyAsync(x => x.Id == request.GoodsReceiptId.Value);

            if (!receiptExists)
                throw new InvalidOperationException(
                    "Goods receipt not found.");
        }

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            var batch = new StockBatch
            {
                IngredientId = request.IngredientId,
                StorageLocationId = request.StorageLocationId,
                GoodsReceiptId = request.GoodsReceiptId,
                BatchNumber = request.BatchNumber.Trim(),
                Quantity = request.Quantity,
                UnitCost = request.UnitCost,
                ReceivedDate = DateTime.UtcNow,
                ExpiryDate = request.ExpiryDate,
                Status = "AVAILABLE"
            };

            _context.StockBatches.Add(batch);

            var movement = new StockMovement
            {
                IngredientId = request.IngredientId,
                StockBatchId = batch.Id,
                StorageLocationId = request.StorageLocationId,
                MovementType = "RECEIVE",
                Quantity = request.Quantity,
                ReferenceType = "GOODS_RECEIPT",
                ReferenceId = request.GoodsReceiptId,
                CreatedById = userId,
                Reason = "Stock received"
            };

            _context.StockMovements.Add(movement);

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // CONSUME STOCK - FEFO
    // ============================================================

    public async Task ConsumeStockAsync(
        ConsumeStockRequest request,
        Guid userId)
    {
        if (request.Quantity <= 0)
            throw new InvalidOperationException(
                "Consumption quantity must be greater than zero.");

        var today = DateTime.UtcNow.Date;

        var batches = await _context.StockBatches
            .Where(b =>
                b.IngredientId == request.IngredientId &&
                (b.Status == "AVAILABLE" || b.Status == "PARTIALLY_USED") &&
                b.Quantity > 0 &&
                (!b.ExpiryDate.HasValue ||
                 b.ExpiryDate.Value.Date >= today))
            .OrderBy(b => b.ExpiryDate == null)
            .ThenBy(b => b.ExpiryDate)
            .ThenBy(b => b.ReceivedDate)
            .ToListAsync();

        var availableQuantity = batches.Sum(b => b.Quantity);

        if (availableQuantity < request.Quantity)
        {
            throw new InvalidOperationException(
                $"Insufficient available stock. " +
                $"Available: {availableQuantity}, " +
                $"Requested: {request.Quantity}.");
        }

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            var remaining = request.Quantity;

            foreach (var batch in batches)
            {
                if (remaining <= 0)
                    break;

                var consumed = Math.Min(
                    batch.Quantity,
                    remaining);

                batch.Quantity -= consumed;

                if (batch.Quantity == 0)
                    batch.Status = "DEPLETED";
                else
                    batch.Status = "PARTIALLY_USED";

                var movement = new StockMovement
                {
                    IngredientId = batch.IngredientId,
                    StockBatchId = batch.Id,
                    StorageLocationId = batch.StorageLocationId,
                    MovementType = "CONSUME",
                    Quantity = consumed,
                    ReferenceType = request.ReferenceType,
                    ReferenceId = request.ReferenceId,
                    Reason = request.Reason,
                    CreatedById = userId
                };

                _context.StockMovements.Add(movement);

                remaining -= consumed;
            }

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // RECORD WASTE
    // ============================================================

    public async Task RecordWasteAsync(
        RecordWasteRequest request,
        Guid userId)
    {
        if (request.Quantity <= 0)
            throw new InvalidOperationException(
                "Waste quantity must be greater than zero.");

        var batch = await _context.StockBatches
            .FirstOrDefaultAsync(b =>
                b.Id == request.StockBatchId);

        if (batch == null)
            throw new InvalidOperationException(
                "Stock batch not found.");

        if (batch.Status != "AVAILABLE" &&
            batch.Status != "PARTIALLY_USED")
        {
            throw new InvalidOperationException(
                "This stock batch is not available for waste recording.");
        }

        if (batch.Quantity < request.Quantity)
        {
            throw new InvalidOperationException(
                $"Insufficient stock. " +
                $"Available: {batch.Quantity}, " +
                $"Requested waste: {request.Quantity}.");
        }

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            batch.Quantity -= request.Quantity;

            if (batch.Quantity == 0)
                batch.Status = "DEPLETED";
            else
                batch.Status = "PARTIALLY_USED";

            var movement = new StockMovement
            {
                IngredientId = batch.IngredientId,
                StockBatchId = batch.Id,
                StorageLocationId = batch.StorageLocationId,
                MovementType = "WASTE",
                Quantity = request.Quantity,
                ReferenceType = "WASTE",
                Reason = request.Reason.Trim(),
                CreatedById = userId
            };

            _context.StockMovements.Add(movement);

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // ADJUST STOCK
    // ============================================================

    public async Task<Guid> AdjustStockAsync(
        AdjustStockRequest request,
        Guid userId)
    {
        if (request.QuantityChange == 0)
            throw new InvalidOperationException(
                "Adjustment quantity cannot be zero.");

        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException(
                "A reason is required for stock adjustments.");

        var batch = await _context.StockBatches
            .FirstOrDefaultAsync(b =>
                b.Id == request.StockBatchId);

        if (batch == null)
            throw new InvalidOperationException(
                "Stock batch not found.");

        if (batch.Quantity + request.QuantityChange < 0)
            throw new InvalidOperationException(
                "Stock cannot become negative.");

        var threshold = _configuration
            .GetValue<decimal>(
                "Inventory:SignificantAdjustmentThreshold",
                10);

        var isSignificant =
            Math.Abs(request.QuantityChange) >= threshold;

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            var adjustment = new StockAdjustment
            {
                IngredientId = batch.IngredientId,
                StockBatchId = batch.Id,
                QuantityChange = request.QuantityChange,
                Reason = request.Reason.Trim(),
                Status = isSignificant
                    ? "PENDING_APPROVAL"
                    : "APPROVED",
                RequestedById = userId
            };

            _context.StockAdjustments.Add(adjustment);

            // Small adjustments can be applied immediately.
            if (!isSignificant)
            {
                batch.Quantity += request.QuantityChange;

                batch.Status = batch.Quantity == 0
                    ? "DEPLETED"
                    : "PARTIALLY_USED";

                var movement = new StockMovement
                {
                    IngredientId = batch.IngredientId,
                    StockBatchId = batch.Id,
                    StorageLocationId = batch.StorageLocationId,
                    MovementType = request.QuantityChange > 0
                        ? "ADJUSTMENT_IN"
                        : "ADJUSTMENT_OUT",
                    Quantity = Math.Abs(request.QuantityChange),
                    ReferenceType = "ADJUSTMENT",
                    ReferenceId = adjustment.Id,
                    Reason = request.Reason.Trim(),
                    CreatedById = userId
                };

                _context.StockMovements.Add(movement);

                adjustment.Status = "APPLIED";
                adjustment.ApprovedById = userId;
                adjustment.ApprovedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();

            return adjustment.Id;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // GET ADJUSTMENTS
    // ============================================================

    public async Task<List<StockAdjustmentResponse>> GetAdjustmentsAsync(
        string? status = null)
    {
        var query = _context.StockAdjustments
            .AsNoTracking()
            .Include(a => a.Ingredient)
            .Include(a => a.StockBatch)
            .Include(a => a.RequestedBy)
            .Include(a => a.ApprovedBy)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var upper = status.Trim().ToUpper();
            query = query.Where(a => a.Status == upper);
        }

        return await query
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new StockAdjustmentResponse
            {
                Id = a.Id,
                IngredientId = a.IngredientId,
                IngredientName = a.Ingredient.Name,
                StockBatchId = a.StockBatchId,
                BatchNumber = a.StockBatch.BatchNumber,
                QuantityChange = a.QuantityChange,
                Reason = a.Reason,
                Status = a.Status,
                RequestedById = a.RequestedById,
                RequestedByName = $"{a.RequestedBy.FirstName} {a.RequestedBy.LastName}",
                ApprovedById = a.ApprovedById,
                ApprovedByName = a.ApprovedBy != null ? $"{a.ApprovedBy.FirstName} {a.ApprovedBy.LastName}" : null,
                ApprovedAt = a.ApprovedAt,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync();
    }


    // ============================================================
    // APPROVE ADJUSTMENT
    // ============================================================

    public async Task ApproveAdjustmentAsync(
        Guid adjustmentId,
        Guid managerId)
    {
        var adjustment = await _context.StockAdjustments
            .Include(a => a.StockBatch)
            .FirstOrDefaultAsync(a => a.Id == adjustmentId);

        if (adjustment == null)
            throw new InvalidOperationException(
                "Stock adjustment not found.");

        if (adjustment.Status != "PENDING_APPROVAL")
            throw new InvalidOperationException(
                "Only pending adjustments can be approved.");

        var batch = adjustment.StockBatch;

        if (batch.Quantity + adjustment.QuantityChange < 0)
            throw new InvalidOperationException(
                "Approval would result in negative stock.");

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            batch.Quantity += adjustment.QuantityChange;

            batch.Status = batch.Quantity == 0
                ? "DEPLETED"
                : "PARTIALLY_USED";

            adjustment.Status = "APPLIED";
            adjustment.ApprovedById = managerId;
            adjustment.ApprovedAt = DateTime.UtcNow;

            var movement = new StockMovement
            {
                IngredientId = batch.IngredientId,
                StockBatchId = batch.Id,
                StorageLocationId = batch.StorageLocationId,
                MovementType = adjustment.QuantityChange > 0
                    ? "ADJUSTMENT_IN"
                    : "ADJUSTMENT_OUT",
                Quantity = Math.Abs(adjustment.QuantityChange),
                ReferenceType = "ADJUSTMENT",
                ReferenceId = adjustment.Id,
                Reason = adjustment.Reason,
                CreatedById = managerId
            };

            _context.StockMovements.Add(movement);

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // REJECT ADJUSTMENT
    // ============================================================

    public async Task RejectAdjustmentAsync(
        Guid adjustmentId,
        Guid managerId)
    {
        var adjustment = await _context.StockAdjustments
            .FirstOrDefaultAsync(a => a.Id == adjustmentId);

        if (adjustment == null)
            throw new InvalidOperationException(
                "Stock adjustment not found.");

        if (adjustment.Status != "PENDING_APPROVAL")
            throw new InvalidOperationException(
                "Only pending adjustments can be rejected.");

        adjustment.Status = "REJECTED";
        adjustment.ApprovedById = managerId;
        adjustment.ApprovedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
    }


    // ============================================================
    // TRANSFER STOCK
    // ============================================================

    public async Task TransferStockAsync(
        TransferStockRequest request,
        Guid userId)
    {
        if (request.Quantity <= 0)
            throw new InvalidOperationException(
                "Transfer quantity must be greater than zero.");

        var sourceBatch = await _context.StockBatches
            .FirstOrDefaultAsync(b =>
                b.Id == request.StockBatchId);

        if (sourceBatch == null)
            throw new InvalidOperationException(
                "Stock batch not found.");

        if (sourceBatch.Quantity < request.Quantity)
            throw new InvalidOperationException(
                "Insufficient stock for transfer.");

        var destination = await _context.StorageLocations
            .FirstOrDefaultAsync(x => x.Id == request.DestinationStorageLocationId);

        if (destination == null)
            throw new InvalidOperationException(
                "Destination storage location not found.");

        if (!destination.IsActive)
            throw new InvalidOperationException(
                $"Destination storage location '{destination.Name}' is deactivated. Stock cannot be transferred into a deactivated storage location.");

        if (destination.Id == sourceBatch.StorageLocationId)
            throw new InvalidOperationException(
                "Source and destination locations cannot be the same.");

        await using var transaction =
            await _context.Database.BeginTransactionAsync();

        try
        {
            sourceBatch.Quantity -= request.Quantity;

            if (sourceBatch.Quantity == 0)
                sourceBatch.Status = "DEPLETED";
            else
                sourceBatch.Status = "PARTIALLY_USED";

            // Create a new batch at the destination.
            var destinationBatch = new StockBatch
            {
                IngredientId = sourceBatch.IngredientId,
                StorageLocationId = destination.Id,
                GoodsReceiptId = sourceBatch.GoodsReceiptId,
                BatchNumber = sourceBatch.BatchNumber,
                Quantity = request.Quantity,
                UnitCost = sourceBatch.UnitCost,
                ReceivedDate = sourceBatch.ReceivedDate,
                ExpiryDate = sourceBatch.ExpiryDate,
                Status = "AVAILABLE"
            };

            _context.StockBatches.Add(destinationBatch);

            var transferOut = new StockMovement
            {
                IngredientId = sourceBatch.IngredientId,
                StockBatchId = sourceBatch.Id,
                StorageLocationId = sourceBatch.StorageLocationId,
                MovementType = "TRANSFER_OUT",
                Quantity = request.Quantity,
                ReferenceType = "TRANSFER",
                ReferenceId = destinationBatch.Id,
                CreatedById = userId
            };

            var transferIn = new StockMovement
            {
                IngredientId = sourceBatch.IngredientId,
                StockBatchId = destinationBatch.Id,
                StorageLocationId = destination.Id,
                MovementType = "TRANSFER_IN",
                Quantity = request.Quantity,
                ReferenceType = "TRANSFER",
                ReferenceId = sourceBatch.Id,
                CreatedById = userId
            };

            _context.StockMovements.Add(transferOut);
            _context.StockMovements.Add(transferIn);

            await _context.SaveChangesAsync();

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }


    // ============================================================
    // MAPPING
    // ============================================================

    private static InventoryResponse MapInventory(
        Ingredient ingredient)
    {
        var today = DateTime.UtcNow.Date;

        var availableBatches = ingredient.StockBatches
            .Where(b =>
                b.Status != "DEPLETED" &&
                b.Quantity > 0 &&
                (!b.ExpiryDate.HasValue ||
                 b.ExpiryDate.Value.Date >= today))
            .ToList();

        var currentStock =
            availableBatches.Sum(b => b.Quantity);

        return new InventoryResponse
        {
            IngredientId = ingredient.Id,
            IngredientName = ingredient.Name,
            SKU = ingredient.SKU,
            Unit = ingredient.Unit,
            CurrentStock = currentStock,
            MinimumStockLevel = ingredient.MinimumStockLevel,
            MaximumStockLevel = ingredient.MaximumStockLevel,
            IsLowStock =
                currentStock < ingredient.MinimumStockLevel,

            Batches = ingredient.StockBatches
                .OrderBy(b => b.ExpiryDate)
                .Select(b => new StockBatchResponse
                {
                    Id = b.Id,
                    BatchNumber = b.BatchNumber,
                    Quantity = b.Quantity,
                    UnitCost = b.UnitCost,
                    ReceivedDate = b.ReceivedDate,
                    ExpiryDate = b.ExpiryDate,
                    Status = b.Status,
                    StorageLocationId = b.StorageLocationId,
                    StorageLocationName =
                        b.StorageLocation.Name
                })
                .ToList()
        };
    }
}