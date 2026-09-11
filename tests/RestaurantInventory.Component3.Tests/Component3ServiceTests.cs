using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Sales;
using RestaurantInventory.API.Models.Identity;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Models.Sales;
using RestaurantInventory.API.Services;
using Xunit;

namespace RestaurantInventory.Component3.Tests;

public class Component3ServiceTests
{
    [Fact]
    public async Task CreateSale_UsesRecipeQuantityAndReducesStockWithMovement()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var sales = fixture.CreateSalesService();

        var response = await sales.CreateSaleAsync(
            new CreateSaleRequest
            {
                Items =
                [
                    new CreateSaleItemRequest
                    {
                        MenuItemId = fixture.MenuItem.Id,
                        Quantity = 2
                    }
                ]
            },
            fixture.User.Id);

        var batch = await fixture.Context.StockBatches
            .SingleAsync();
        var movement = await fixture.Context.StockMovements
            .SingleAsync();

        Assert.Equal(fixture.MenuItem.SellingPrice * 2, response.TotalAmount);
        Assert.Single(response.Items);
        Assert.Equal(6m, batch.Quantity);
        Assert.Equal("CONSUME", movement.MovementType);
        Assert.Equal("SALE", movement.ReferenceType);
        Assert.Equal(response.Id, movement.ReferenceId);
    }

    [Fact]
    public async Task CreateSale_RejectsZeroQuantity()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var sales = fixture.CreateSalesService();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sales.CreateSaleAsync(
                new CreateSaleRequest
                {
                    Items =
                    [
                        new CreateSaleItemRequest
                        {
                            MenuItemId = fixture.MenuItem.Id,
                            Quantity = 0
                        }
                    ]
                },
                fixture.User.Id));
    }

    [Fact]
    public async Task ConfirmWaste_SetsAuthenticatedConfirmationFields()
    {
        await using var fixture = await TestFixture.CreateAsync();
        var waste = new WasteRecord
        {
            IngredientId = fixture.Ingredient.Id,
            StockBatchId = fixture.Batch.Id,
            Quantity = 1,
            Reason = "Spoilage",
            ReportedById = fixture.User.Id,
            Status = "RECORDED"
        };

        fixture.Context.WasteRecords.Add(waste);
        await fixture.Context.SaveChangesAsync();

        var response = await fixture.CreateSalesService()
            .ConfirmWasteAsync(waste.Id, fixture.User.Id);

        Assert.Equal(fixture.User.Id, response.ConfirmedById);
        Assert.NotNull(response.ConfirmedAt);
        Assert.Equal("CONFIRMED", response.Status);
    }

    private sealed class TestFixture : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;
        public ApplicationDbContext Context { get; }
        public User User { get; }
        public Ingredient Ingredient { get; }
        public StockBatch Batch { get; }
        public MenuItem MenuItem { get; }

        private TestFixture(
            SqliteConnection connection,
            ApplicationDbContext context,
            User user,
            Ingredient ingredient,
            StockBatch batch,
            MenuItem menuItem)
        {
            _connection = connection;
            Context = context;
            User = user;
            Ingredient = ingredient;
            Batch = batch;
            MenuItem = menuItem;
        }

        public static async Task<TestFixture> CreateAsync()
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
                Role = new Role { Name = "SALES_KITCHEN_STAFF" },
                FirstName = "Test",
                LastName = "User",
                Email = "test@example.com"
            };
            var category = new IngredientCategory { Name = "Test" };
            var ingredient = new Ingredient
            {
                Category = category,
                Name = "Test Ingredient",
                SKU = "TEST-001",
                Unit = "kg"
            };
            var location = new StorageLocation { Name = "Test Storage" };
            var batch = new StockBatch
            {
                Ingredient = ingredient,
                StorageLocation = location,
                BatchNumber = "TEST-BATCH",
                Quantity = 10,
                UnitCost = 1,
                ReceivedDate = DateTime.UtcNow,
                Status = "AVAILABLE"
            };
            var menuItem = new MenuItem
            {
                Name = "Test Meal",
                SellingPrice = 25,
                IsActive = true
            };
            var recipe = new Recipe
            {
                MenuItem = menuItem,
                Version = 1,
                IsActive = true
            };
            recipe.Ingredients.Add(new RecipeIngredient
            {
                Recipe = recipe,
                Ingredient = ingredient,
                QuantityRequired = 2,
                Unit = "kg"
            });

            context.Users.Add(user);
            context.StockBatches.Add(batch);
            context.MenuItems.Add(menuItem);
            context.Recipes.Add(recipe);
            await context.SaveChangesAsync();

            return new TestFixture(
                connection,
                context,
                user,
                ingredient,
                batch,
                menuItem);
        }

        public SalesService CreateSalesService()
        {
            return new SalesService(
                Context,
                new InventoryService(Context, new ConfigurationManager()));
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }
}
