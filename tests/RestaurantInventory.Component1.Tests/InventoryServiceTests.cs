using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Models.Identity;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Services;
using Xunit;

namespace RestaurantInventory.Component1.Tests;

public class InventoryServiceTests
{
    // ============================================================
    // 1. RECEIVE STOCK TESTS
    // ============================================================

    [Fact]
    public async Task ReceiveStock_CreatesBatchAndStockMovement()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new ReceiveStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "BATCH-NEW-01",
            Quantity = 20,
            UnitCost = 15.50m,
            ExpiryDate = DateTime.UtcNow.AddDays(14)
        };

        await service.ReceiveStockAsync(request, fixture.User.Id);

        var batch = await fixture.Context.StockBatches
            .FirstOrDefaultAsync(b => b.BatchNumber == "BATCH-NEW-01");
        Assert.NotNull(batch);
        Assert.Equal("BATCH-NEW-01", batch.BatchNumber);
        Assert.Equal(20, batch.Quantity);
        Assert.Equal(15.50m, batch.UnitCost);
        Assert.Equal("AVAILABLE", batch.Status);

        var movement = await fixture.Context.StockMovements
            .FirstOrDefaultAsync(m => m.StockBatchId == batch.Id);
        Assert.NotNull(movement);
        Assert.Equal("RECEIVE", movement.MovementType);
        Assert.Equal(20, movement.Quantity);
        Assert.Equal(fixture.User.Id, movement.CreatedById);
    }

    [Fact]
    public async Task ReceiveStock_ExceedingMaximumStockLevel_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Ingredient has MaxStockLevel = 50, existing batch has Quantity = 30.
        // Trying to receive 25 would total 55, which exceeds the max of 50.
        var request = new ReceiveStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "BATCH-OVERMAX",
            Quantity = 25,
            UnitCost = 10,
            ExpiryDate = DateTime.UtcNow.AddDays(10)
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ReceiveStockAsync(request, fixture.User.Id));

        Assert.Contains("exceed the maximum stock level", ex.Message);
    }

    [Fact]
    public async Task ReceiveStock_WithPastExpiryDate_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new ReceiveStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "BATCH-EXPIRED",
            Quantity = 5,
            UnitCost = 10,
            ExpiryDate = DateTime.UtcNow.AddDays(-2)
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ReceiveStockAsync(request, fixture.User.Id));

        Assert.Contains("Expiry date cannot be in the past", ex.Message);
    }

    [Fact]
    public async Task ReceiveStock_DeactivatedLocation_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var inactiveLocation = new StorageLocation
        {
            Name = "Decommissioned Cold Room",
            IsActive = false
        };
        fixture.Context.StorageLocations.Add(inactiveLocation);
        await fixture.Context.SaveChangesAsync();

        var request = new ReceiveStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = inactiveLocation.Id,
            BatchNumber = "BATCH-INACTIVE-LOC",
            Quantity = 5,
            UnitCost = 10,
            ExpiryDate = DateTime.UtcNow.AddDays(5)
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ReceiveStockAsync(request, fixture.User.Id));

        Assert.Contains("deactivated", ex.Message);
    }

    // ============================================================
    // 2. FEFO CONSUMPTION TESTS
    // ============================================================

    [Fact]
    public async Task ConsumeStock_FollowsFefoOrder_EarliestExpiryConsumedFirst()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Clear existing batches
        fixture.Context.StockBatches.RemoveRange(fixture.Context.StockBatches);
        await fixture.Context.SaveChangesAsync();

        // Batch 1: expires in 5 days, 10 units
        var batch1 = new StockBatch
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "FEFO-EARLIEST",
            Quantity = 10,
            UnitCost = 5,
            ReceivedDate = DateTime.UtcNow.AddDays(-1),
            ExpiryDate = DateTime.UtcNow.AddDays(5),
            Status = "AVAILABLE"
        };

        // Batch 2: expires in 15 days, 15 units
        var batch2 = new StockBatch
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "FEFO-LATER",
            Quantity = 15,
            UnitCost = 5,
            ReceivedDate = DateTime.UtcNow.AddDays(-2),
            ExpiryDate = DateTime.UtcNow.AddDays(15),
            Status = "AVAILABLE"
        };

        fixture.Context.StockBatches.AddRange(batch1, batch2);
        await fixture.Context.SaveChangesAsync();

        // Consume 14 units:
        // Batch 1 should be fully consumed (10 -> 0, DEPLETED)
        // Batch 2 should be partially consumed (15 - 4 = 11, PARTIALLY_USED)
        var request = new ConsumeStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            Quantity = 14,
            Reason = "Lunch Rush Prep"
        };

        await service.ConsumeStockAsync(request, fixture.User.Id);

        var updatedB1 = await fixture.Context.StockBatches.FindAsync(batch1.Id);
        var updatedB2 = await fixture.Context.StockBatches.FindAsync(batch2.Id);

        Assert.NotNull(updatedB1);
        Assert.NotNull(updatedB2);
        Assert.Equal(0, updatedB1.Quantity);
        Assert.Equal("DEPLETED", updatedB1.Status);

        Assert.Equal(11, updatedB2.Quantity);
        Assert.Equal("PARTIALLY_USED", updatedB2.Status);
    }

    [Fact]
    public async Task ConsumeStock_ExceedingAvailableStock_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Existing batch has Quantity = 30
        var request = new ConsumeStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            Quantity = 50,
            Reason = "Over-consumption test"
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ConsumeStockAsync(request, fixture.User.Id));

        Assert.Contains("Insufficient available stock", ex.Message);
    }

    [Fact]
    public async Task ConsumeStock_IgnoresExpiredBatches()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Clear existing batches
        fixture.Context.StockBatches.RemoveRange(fixture.Context.StockBatches);

        // Expired batch with 20 units
        var expiredBatch = new StockBatch
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "BATCH-EXPIRED",
            Quantity = 20,
            UnitCost = 5,
            ReceivedDate = DateTime.UtcNow.AddDays(-10),
            ExpiryDate = DateTime.UtcNow.AddDays(-1),
            Status = "AVAILABLE"
        };

        fixture.Context.StockBatches.Add(expiredBatch);
        await fixture.Context.SaveChangesAsync();

        // Attempting to consume 5 units should fail because expired stock cannot be consumed
        var request = new ConsumeStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            Quantity = 5,
            Reason = "Attempt to use expired"
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ConsumeStockAsync(request, fixture.User.Id));

        Assert.Contains("Insufficient available stock", ex.Message);
    }

    [Fact]
    public async Task ConsumeStock_ZeroOrNegativeQuantity_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new ConsumeStockRequest
        {
            IngredientId = fixture.Ingredient.Id,
            Quantity = -5,
            Reason = "Negative consumption test"
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ConsumeStockAsync(request, fixture.User.Id));

        Assert.Contains("greater than zero", ex.Message);
    }

    // ============================================================
    // 3. RECORD WASTE TESTS
    // ============================================================

    [Fact]
    public async Task RecordWaste_DeductsQuantityAndCreatesWasteMovement()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new RecordWasteRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            Quantity = 6,
            Reason = "Spilled during preparation"
        };

        await service.RecordWasteAsync(request, fixture.User.Id);

        var batch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(batch);
        Assert.Equal(24, batch.Quantity); // 30 - 6 = 24
        Assert.Equal("PARTIALLY_USED", batch.Status);

        var movement = await fixture.Context.StockMovements
            .FirstOrDefaultAsync(m => m.StockBatchId == fixture.InitialBatch.Id && m.MovementType == "WASTE");
        Assert.NotNull(movement);
        Assert.Equal(6, movement.Quantity);
        Assert.Equal("Spilled during preparation", movement.Reason);
    }

    [Fact]
    public async Task RecordWaste_ExceedingAvailableStock_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new RecordWasteRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            Quantity = 50,
            Reason = "Too much waste"
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.RecordWasteAsync(request, fixture.User.Id));

        Assert.Contains("Insufficient stock", ex.Message);
    }

    // ============================================================
    // 4. STOCK ADJUSTMENTS & TWO-MAN RULE
    // ============================================================

    [Fact]
    public async Task SmallAdjustment_AppliedImmediatelyWithoutPendingStatus()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Initial batch quantity is 30. Small adjustment (+3 units) is < 10 threshold.
        var request = new AdjustStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            QuantityChange = 3,
            Reason = "Physical count discrepancy"
        };

        var adjId = await service.AdjustStockAsync(request, fixture.User.Id);

        var adj = await fixture.Context.StockAdjustments.FindAsync(adjId);
        Assert.NotNull(adj);
        Assert.Equal("APPLIED", adj.Status);

        var batch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(batch);
        Assert.Equal(33, batch.Quantity);
    }

    [Fact]
    public async Task SignificantAdjustment_RequiresApproval_DoesNotChangeStockImmediately()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Significant adjustment (+15 units) is >= 10 threshold.
        var request = new AdjustStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            QuantityChange = 15,
            Reason = "Large bulk count recovery"
        };

        var adjId = await service.AdjustStockAsync(request, fixture.User.Id);

        var adj = await fixture.Context.StockAdjustments.FindAsync(adjId);
        Assert.NotNull(adj);
        Assert.Equal("PENDING_APPROVAL", adj.Status);

        // Stock must remain unchanged at 30 prior to managerial approval
        var batch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(batch);
        Assert.Equal(30, batch.Quantity);
    }

    [Fact]
    public async Task ApproveSignificantAdjustment_AppliesQuantityChangeAndStockMovement()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new AdjustStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            QuantityChange = 12,
            Reason = "Found undamaged cases in rear room"
        };

        var adjId = await service.AdjustStockAsync(request, fixture.User.Id);

        // Manager approves
        await service.ApproveAdjustmentAsync(adjId, fixture.ManagerUser.Id);

        var adj = await fixture.Context.StockAdjustments.FindAsync(adjId);
        Assert.NotNull(adj);
        Assert.Equal("APPLIED", adj.Status);
        Assert.Equal(fixture.ManagerUser.Id, adj.ApprovedById);

        var batch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(batch);
        Assert.Equal(42, batch.Quantity); // 30 + 12 = 42

        var movement = await fixture.Context.StockMovements
            .FirstOrDefaultAsync(m => m.ReferenceId == adjId && m.MovementType == "ADJUSTMENT_IN");
        Assert.NotNull(movement);
        Assert.Equal(12, movement.Quantity);
    }

    [Fact]
    public async Task RejectSignificantAdjustment_LeavesStockUnchanged()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new AdjustStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            QuantityChange = 15,
            Reason = "Erroneous count submission"
        };

        var adjId = await service.AdjustStockAsync(request, fixture.User.Id);

        // Manager rejects
        await service.RejectAdjustmentAsync(adjId, fixture.ManagerUser.Id);

        var adj = await fixture.Context.StockAdjustments.FindAsync(adjId);
        Assert.NotNull(adj);
        Assert.Equal("REJECTED", adj.Status);

        var batch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(batch);
        Assert.Equal(30, batch.Quantity); // Unchanged
    }

    // ============================================================
    // 4. STOCK LOCATION TRANSFER TESTS
    // ============================================================

    [Fact]
    public async Task TransferStock_ReducesSourceBatchAndCreatesDestinationBatch()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Initial batch has 30 units in LocationA. Transfer 10 units to LocationB.
        var request = new TransferStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            DestinationStorageLocationId = fixture.LocationB.Id,
            Quantity = 10
        };

        await service.TransferStockAsync(request, fixture.User.Id);

        var sourceBatch = await fixture.Context.StockBatches.FindAsync(fixture.InitialBatch.Id);
        Assert.NotNull(sourceBatch);
        Assert.Equal(20, sourceBatch.Quantity);

        var destBatch = await fixture.Context.StockBatches
            .FirstOrDefaultAsync(b => b.StorageLocationId == fixture.LocationB.Id && b.BatchNumber == fixture.InitialBatch.BatchNumber);
        Assert.NotNull(destBatch);
        Assert.Equal(10, destBatch.Quantity);

        // Verify movement records
        var outMovement = await fixture.Context.StockMovements
            .FirstOrDefaultAsync(m => m.MovementType == "TRANSFER_OUT" && m.StorageLocationId == fixture.LocationA.Id);
        var inMovement = await fixture.Context.StockMovements
            .FirstOrDefaultAsync(m => m.MovementType == "TRANSFER_IN" && m.StorageLocationId == fixture.LocationB.Id);

        Assert.NotNull(outMovement);
        Assert.NotNull(inMovement);
        Assert.Equal(10, outMovement.Quantity);
        Assert.Equal(10, inMovement.Quantity);
    }

    [Fact]
    public async Task TransferStock_SameLocation_ThrowsInvalidOperationException()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        var request = new TransferStockRequest
        {
            StockBatchId = fixture.InitialBatch.Id,
            DestinationStorageLocationId = fixture.LocationA.Id, // Same location
            Quantity = 5
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.TransferStockAsync(request, fixture.User.Id));

        Assert.Contains("Source and destination locations cannot be the same", ex.Message);
    }

    // ============================================================
    // 5. THRESHOLD & MONITORING QUERIES
    // ============================================================

    [Fact]
    public async Task GetLowStock_ReturnsIngredientsBelowMinimumThreshold()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Ingredient MinimumStockLevel is 15.
        // Current batch has 30. Consume 20 so stock becomes 10 (< 15).
        await service.ConsumeStockAsync(
            new ConsumeStockRequest
            {
                IngredientId = fixture.Ingredient.Id,
                Quantity = 20,
                Reason = "Deplete below minimum"
            },
            fixture.User.Id);

        var lowStockList = await service.GetLowStockAsync();
        var lowItem = lowStockList.FirstOrDefault(i => i.IngredientId == fixture.Ingredient.Id);

        Assert.NotNull(lowItem);
        Assert.Equal(10, lowItem.CurrentStock);
        Assert.Equal(15, lowItem.MinimumStockLevel);
        Assert.True(lowItem.IsLowStock);
    }

    [Fact]
    public async Task GetExpiringStock_ReturnsBatchesWithinHorizon()
    {
        await using var fixture = await InventoryTestFixture.CreateAsync();
        var service = fixture.CreateInventoryService();

        // Batch expiring in 3 days
        var expiringBatch = new StockBatch
        {
            IngredientId = fixture.Ingredient.Id,
            StorageLocationId = fixture.LocationA.Id,
            BatchNumber = "BATCH-EXP-3DAYS",
            Quantity = 8,
            UnitCost = 4,
            ReceivedDate = DateTime.UtcNow,
            ExpiryDate = DateTime.UtcNow.AddDays(3),
            Status = "AVAILABLE"
        };
        fixture.Context.StockBatches.Add(expiringBatch);
        await fixture.Context.SaveChangesAsync();

        // Query with 7 days horizon -> should contain batch
        var expiring7Days = await service.GetExpiringStockAsync(7);
        Assert.Contains(expiring7Days, b => b.BatchNumber == "BATCH-EXP-3DAYS");

        // Query with 1 day horizon -> should NOT contain batch
        var expiring1Day = await service.GetExpiringStockAsync(1);
        Assert.DoesNotContain(expiring1Day, b => b.BatchNumber == "BATCH-EXP-3DAYS");
    }

    // ============================================================
    // TEST FIXTURE (IN-MEMORY SQLITE)
    // ============================================================

    private sealed class InventoryTestFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;
        public ApplicationDbContext Context { get; }
        public User User { get; }
        public User ManagerUser { get; }
        public Ingredient Ingredient { get; }
        public StorageLocation LocationA { get; }
        public StorageLocation LocationB { get; }
        public StockBatch InitialBatch { get; }

        private InventoryTestFixture(
            SqliteConnection connection,
            ApplicationDbContext context,
            User user,
            User managerUser,
            Ingredient ingredient,
            StorageLocation locationA,
            StorageLocation locationB,
            StockBatch initialBatch)
        {
            _connection = connection;
            Context = context;
            User = user;
            ManagerUser = managerUser;
            Ingredient = ingredient;
            LocationA = locationA;
            LocationB = locationB;
            InitialBatch = initialBatch;
        }

        public static async Task<InventoryTestFixture> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();

            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlite(connection)
                .Options;
            var context = new ApplicationDbContext(options);
            await context.Database.EnsureCreatedAsync();

            var user = new User
            {
                Role = new Role { Name = "INVENTORY_MANAGER" },
                FirstName = "Sam",
                LastName = "Warehouse",
                Email = "sam@restaurant.com"
            };

            var manager = new User
            {
                Role = new Role { Name = "RESTAURANT_MANAGER" },
                FirstName = "Alice",
                LastName = "Manager",
                Email = "alice@restaurant.com"
            };

            var category = new IngredientCategory { Name = "Dairy" };

            var ingredient = new Ingredient
            {
                Category = category,
                Name = "Fresh Milk",
                SKU = "DRY-MLK-01",
                Unit = "L",
                MinimumStockLevel = 15,
                MaximumStockLevel = 50
            };

            var locA = new StorageLocation { Name = "Cold Room A", IsActive = true };
            var locB = new StorageLocation { Name = "Main Kitchen Cooler", IsActive = true };

            var batch = new StockBatch
            {
                Ingredient = ingredient,
                StorageLocation = locA,
                BatchNumber = "BATCH-INIT-30L",
                Quantity = 30,
                UnitCost = 2.50m,
                ReceivedDate = DateTime.UtcNow.AddDays(-2),
                ExpiryDate = DateTime.UtcNow.AddDays(20),
                Status = "AVAILABLE"
            };

            context.Users.AddRange(user, manager);
            context.StorageLocations.AddRange(locA, locB);
            context.StockBatches.Add(batch);
            await context.SaveChangesAsync();

            return new InventoryTestFixture(
                connection,
                context,
                user,
                manager,
                ingredient,
                locA,
                locB,
                batch);
        }

        public InventoryService CreateInventoryService()
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    { "Inventory:SignificantAdjustmentThreshold", "10" }
                })
                .Build();

            return new InventoryService(Context, config);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }
}
