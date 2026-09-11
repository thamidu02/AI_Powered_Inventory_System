using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.DTOs.Sales;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Models.Sales;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class SalesService : ISalesService
{
    private const int MaxPageSize = 100;

    private readonly ApplicationDbContext _context;
    private readonly IInventoryService _inventoryService;

    public SalesService(
        ApplicationDbContext context,
        IInventoryService inventoryService)
    {
        _context = context;
        _inventoryService = inventoryService;
    }

    private static int NormalizePageSize(int pageSize)
    {
        if (pageSize < 1)
            return 20;

        return Math.Min(pageSize, MaxPageSize);
    }

    public async Task<MenuItemResponse> CreateMenuItemAsync(
        CreateMenuItemRequest request)
    {
        var name = request.Name.Trim();

        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Menu item name is required.");

        var duplicateName = await _context.MenuItems
            .AnyAsync(mi => mi.Name.ToLower() == name.ToLower());

        if (duplicateName)
            throw new InvalidOperationException(
                "A menu item with this name already exists.");

        var menuItem = new MenuItem
        {
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim(),
            SellingPrice = request.SellingPrice,
            IsActive = true
        };

        _context.MenuItems.Add(menuItem);
        await _context.SaveChangesAsync();

        return MapMenuItem(menuItem);
    }

    public async Task<MenuItemResponse?> UpdateMenuItemAsync(
        Guid menuItemId,
        UpdateMenuItemRequest request)
    {
        var menuItem = await _context.MenuItems
            .Include(mi => mi.Recipes)
            .FirstOrDefaultAsync(mi => mi.Id == menuItemId);

        if (menuItem == null)
            return null;

        var name = request.Name.Trim();

        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Menu item name is required.");

        var duplicateName = await _context.MenuItems
            .AnyAsync(mi =>
                mi.Id != menuItemId &&
                mi.Name.ToLower() == name.ToLower());

        if (duplicateName)
            throw new InvalidOperationException(
                "A menu item with this name already exists.");

        menuItem.Name = name;
        menuItem.Description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();
        menuItem.SellingPrice = request.SellingPrice;
        menuItem.IsActive = request.IsActive;
        menuItem.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return MapMenuItem(menuItem);
    }

    public async Task<bool> DeleteMenuItemAsync(Guid menuItemId)
    {
        var menuItem = await _context.MenuItems
            .FirstOrDefaultAsync(mi => mi.Id == menuItemId);

        if (menuItem == null)
            return false;

        var hasRecipes = await _context.Recipes
            .AnyAsync(r => r.MenuItemId == menuItemId);
        var hasSaleItems = await _context.SaleItems
            .AnyAsync(si => si.MenuItemId == menuItemId);

        if (hasRecipes || hasSaleItems)
        {
            var references = new List<string>();
            if (hasRecipes)
                references.Add("recipes");
            if (hasSaleItems)
                references.Add("historical sale items");

            throw new InvalidOperationException(
                $"Menu item cannot be physically deleted because it is referenced by {string.Join(" and ", references)}.");
        }

        _context.MenuItems.Remove(menuItem);
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<List<MenuItemResponse>> GetMenuItemsAsync()
    {
        var menuItems = await _context.MenuItems
            .AsNoTracking()
            .Include(mi => mi.Recipes)
            .OrderBy(mi => mi.Name)
            .ToListAsync();

        return menuItems.Select(MapMenuItem).ToList();
    }

    public async Task<MenuItemResponse?> GetMenuItemByIdAsync(Guid menuItemId)
    {
        var menuItem = await _context.MenuItems
            .AsNoTracking()
            .Include(mi => mi.Recipes)
            .FirstOrDefaultAsync(mi => mi.Id == menuItemId);

        return menuItem == null
            ? null
            : MapMenuItem(menuItem);
    }

    public async Task<RecipeResponse?> GetActiveRecipeAsync(Guid menuItemId)
    {
        var recipe = await _context.Recipes
            .AsNoTracking()
            .Include(r => r.MenuItem)
            .Include(r => r.Ingredients)
                .ThenInclude(ri => ri.Ingredient)
            .Where(r => r.MenuItemId == menuItemId && r.IsActive)
            .OrderByDescending(r => r.Version)
            .FirstOrDefaultAsync();

        return recipe == null
            ? null
            : MapRecipe(recipe);
    }

    public async Task<List<RecipeResponse>> GetRecipesAsync()
    {
        var recipes = await _context.Recipes
            .AsNoTracking()
            .Include(r => r.MenuItem)
            .Include(r => r.Ingredients)
                .ThenInclude(ri => ri.Ingredient)
            .OrderBy(r => r.MenuItem.Name)
            .ThenByDescending(r => r.Version)
            .ToListAsync();

        return recipes.Select(MapRecipe).ToList();
    }

    public async Task<RecipeResponse?> GetRecipeByIdAsync(Guid recipeId)
    {
        var recipe = await _context.Recipes
            .AsNoTracking()
            .Include(r => r.MenuItem)
            .Include(r => r.Ingredients)
                .ThenInclude(ri => ri.Ingredient)
            .FirstOrDefaultAsync(r => r.Id == recipeId);

        return recipe == null ? null : MapRecipe(recipe);
    }

    public async Task<RecipeResponse> CreateRecipeAsync(
        CreateRecipeRequest request)
    {
        var menuItem = await _context.MenuItems
            .FirstOrDefaultAsync(mi => mi.Id == request.MenuItemId);

        if (menuItem == null)
            throw new InvalidOperationException("Menu item not found.");

        if (!menuItem.IsActive)
            throw new InvalidOperationException("Recipe cannot be created for an inactive menu item.");

        var ingredientInputs = await ValidateRecipeIngredientsAsync(request.Ingredients);
        var recipe = new Recipe
        {
            MenuItemId = menuItem.Id,
            Version = request.Version,
            IsActive = request.IsActive,
            Ingredients = ingredientInputs
                .Select(input => new RecipeIngredient
                {
                    IngredientId = input.Ingredient.Id,
                    QuantityRequired = input.Request.QuantityRequired,
                    Unit = ResolveUnit(input.Request.Unit, input.Ingredient.Unit)
                })
                .ToList()
        };

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.Recipes.Add(recipe);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        recipe.MenuItem = menuItem;
        foreach (var ingredient in recipe.Ingredients)
            ingredient.Ingredient = ingredientInputs
                .First(input => input.Ingredient.Id == ingredient.IngredientId)
                .Ingredient;

        return MapRecipe(recipe);
    }

    public async Task<RecipeResponse?> UpdateRecipeAsync(
        Guid recipeId,
        UpdateRecipeRequest request)
    {
        var recipe = await _context.Recipes
            .Include(r => r.MenuItem)
            .Include(r => r.Ingredients)
            .FirstOrDefaultAsync(r => r.Id == recipeId);

        if (recipe == null)
            return null;

        var menuItem = await _context.MenuItems
            .FirstOrDefaultAsync(mi => mi.Id == request.MenuItemId);

        if (menuItem == null)
            throw new InvalidOperationException("Menu item not found.");

        if (!menuItem.IsActive)
            throw new InvalidOperationException("Recipe cannot belong to an inactive menu item.");

        var ingredientInputs = await ValidateRecipeIngredientsAsync(request.Ingredients);

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.RecipeIngredients.RemoveRange(recipe.Ingredients);
            recipe.MenuItemId = menuItem.Id;
            recipe.Version = request.Version;
            recipe.IsActive = request.IsActive;
            recipe.UpdatedAt = DateTime.UtcNow;
            recipe.Ingredients = ingredientInputs
                .Select(input => new RecipeIngredient
                {
                    RecipeId = recipe.Id,
                    IngredientId = input.Ingredient.Id,
                    QuantityRequired = input.Request.QuantityRequired,
                    Unit = ResolveUnit(input.Request.Unit, input.Ingredient.Unit)
                })
                .ToList();

            _context.RecipeIngredients.AddRange(recipe.Ingredients);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        recipe.MenuItem = menuItem;
        foreach (var ingredient in recipe.Ingredients)
            ingredient.Ingredient = ingredientInputs
                .First(input => input.Ingredient.Id == ingredient.IngredientId)
                .Ingredient;

        return MapRecipe(recipe);
    }

    public async Task<bool> DeleteRecipeAsync(Guid recipeId)
    {
        var recipe = await _context.Recipes
            .Include(r => r.Ingredients)
            .FirstOrDefaultAsync(r => r.Id == recipeId);

        if (recipe == null)
            return false;

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            _context.RecipeIngredients.RemoveRange(recipe.Ingredients);
            _context.Recipes.Remove(recipe);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        return true;
    }

    private async Task<List<(RecipeIngredientRequest Request, Ingredient Ingredient)>>
        ValidateRecipeIngredientsAsync(
            IReadOnlyCollection<RecipeIngredientRequest>? requests)
    {
        if (requests == null || requests.Count == 0)
            throw new InvalidOperationException("At least one recipe ingredient is required.");

        if (requests.Any(item => item.IngredientId == Guid.Empty))
            throw new InvalidOperationException("Every recipe ingredient must specify an ingredient.");

        if (requests.Any(item => item.QuantityRequired <= 0))
            throw new InvalidOperationException("Recipe ingredient quantities must be greater than zero.");

        if (requests.Select(item => item.IngredientId).Distinct().Count() != requests.Count)
            throw new InvalidOperationException("The same ingredient cannot appear more than once in a recipe.");

        var ingredientIds = requests.Select(item => item.IngredientId).ToList();
        var ingredients = await _context.Ingredients
            .Where(i => ingredientIds.Contains(i.Id))
            .ToListAsync();

        if (ingredients.Count != ingredientIds.Count)
        {
            var missingIds = ingredientIds
                .Except(ingredients.Select(i => i.Id))
                .ToList();
            throw new InvalidOperationException(
                $"Ingredient(s) not found: {string.Join(", ", missingIds)}.");
        }

        return requests
            .Select(request => (
                Request: request,
                Ingredient: ingredients.First(i => i.Id == request.IngredientId)))
            .ToList();
    }

    private static string ResolveUnit(string? requestedUnit, string ingredientUnit)
    {
        var unit = string.IsNullOrWhiteSpace(requestedUnit)
            ? ingredientUnit
            : requestedUnit.Trim();

        if (string.IsNullOrWhiteSpace(unit))
            throw new InvalidOperationException("A unit is required for every recipe ingredient.");

        return unit;
    }

    public async Task<List<SaleResponse>> GetSalesAsync(
        string? search = null,
        DateTime? from = null,
        DateTime? to = null,
        string sortBy = "saleDate",
        bool descending = true,
        int page = 1,
        int pageSize = 20)
    {
        if (page < 1)
            page = 1;

        pageSize = NormalizePageSize(pageSize);

        var query = _context.Sales
            .AsNoTracking()
            .Include(s => s.RecordedBy)
            .Include(s => s.Items)
                .ThenInclude(si => si.MenuItem)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchText = search.Trim();
            query = query.Where(s =>
                s.Status.Contains(searchText) ||
                s.Items.Any(si => si.MenuItem.Name.Contains(searchText)) ||
                s.RecordedBy.FirstName.Contains(searchText) ||
                s.RecordedBy.LastName.Contains(searchText));
        }

        if (from.HasValue)
            query = query.Where(s => s.SaleDate >= from.Value);

        if (to.HasValue)
            query = query.Where(s => s.SaleDate <= to.Value);

        query = sortBy.ToLowerInvariant() switch
        {
            "totalamount" => descending ? query.OrderByDescending(s => s.TotalAmount) : query.OrderBy(s => s.TotalAmount),
            "status" => descending ? query.OrderByDescending(s => s.Status) : query.OrderBy(s => s.Status),
            _ => descending ? query.OrderByDescending(s => s.SaleDate) : query.OrderBy(s => s.SaleDate)
        };

        var sales = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return sales.Select(MapSale).ToList();
    }

    public async Task<SaleResponse?> GetSaleByIdAsync(Guid saleId)
    {
        var sale = await _context.Sales
            .AsNoTracking()
            .Include(s => s.RecordedBy)
            .Include(s => s.Items)
                .ThenInclude(si => si.MenuItem)
            .FirstOrDefaultAsync(s => s.Id == saleId);

        return sale == null ? null : MapSale(sale);
    }

    public async Task<SaleResponse> CreateSaleAsync(
        CreateSaleRequest request,
        Guid userId)
    {
        if (request.Items == null || request.Items.Count == 0)
            throw new InvalidOperationException("At least one sale item is required.");

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            throw new InvalidOperationException("User not found.");

        var sale = new Sale
        {
            RecordedById = userId,
            SaleDate = DateTime.UtcNow,
            Status = "COMPLETED",
            TotalAmount = 0m
        };

        var saleItems = new List<SaleItem>();
        var consumptionPlan = new Dictionary<Guid, decimal>();

        foreach (var itemRequest in request.Items)
        {
            if (itemRequest.Quantity <= 0)
                throw new InvalidOperationException("Sale quantities must be greater than zero.");

            var menuItem = await _context.MenuItems
                .Include(mi => mi.Recipes)
                .FirstOrDefaultAsync(mi => mi.Id == itemRequest.MenuItemId);

            if (menuItem == null)
                throw new InvalidOperationException($"Menu item {itemRequest.MenuItemId} was not found.");

            if (!menuItem.IsActive)
                throw new InvalidOperationException($"Menu item '{menuItem.Name}' is not active.");

            var recipe = await _context.Recipes
                .Include(r => r.Ingredients)
                    .ThenInclude(ri => ri.Ingredient)
                .Where(r => r.MenuItemId == itemRequest.MenuItemId && r.IsActive)
                .OrderByDescending(r => r.Version)
                .FirstOrDefaultAsync();

            if (recipe == null)
                throw new InvalidOperationException($"Menu item '{menuItem.Name}' does not have a valid active recipe.");

            if (recipe.Ingredients.Count == 0 ||
                recipe.Ingredients.Any(ri => ri.QuantityRequired <= 0))
            {
                throw new InvalidOperationException(
                    $"Menu item '{menuItem.Name}' has an invalid recipe.");
            }

            var saleItem = new SaleItem
            {
                MenuItemId = itemRequest.MenuItemId,
                Quantity = itemRequest.Quantity,
                UnitPrice = menuItem.SellingPrice,
                Subtotal = menuItem.SellingPrice * itemRequest.Quantity
            };

            saleItems.Add(saleItem);
            sale.TotalAmount += saleItem.Subtotal;

            foreach (var recipeIngredient in recipe.Ingredients)
            {
                var itemConsumption = recipeIngredient.QuantityRequired * itemRequest.Quantity;
                if (itemConsumption <= 0)
                    continue;

                var ingredientId = recipeIngredient.IngredientId;
                if (!consumptionPlan.ContainsKey(ingredientId))
                    consumptionPlan[ingredientId] = 0m;

                consumptionPlan[ingredientId] += itemConsumption;
            }
        }

        foreach (var (ingredientId, neededQuantity) in consumptionPlan)
        {
            var ingredient = await _context.Ingredients
                .FirstOrDefaultAsync(i => i.Id == ingredientId);

            if (ingredient == null)
                throw new InvalidOperationException("One or more recipe ingredients are missing from inventory.");

            var availableQuantity = await _context.StockBatches
                .Where(b =>
                    b.IngredientId == ingredientId &&
                    (b.Status == "AVAILABLE" || b.Status == "PARTIALLY_USED") &&
                    b.Quantity > 0 &&
                    (!b.ExpiryDate.HasValue || b.ExpiryDate.Value.Date >= DateTime.UtcNow.Date))
                .SumAsync(b => b.Quantity);

            if (availableQuantity < neededQuantity)
                throw new InvalidOperationException(
                    $"Insufficient stock for ingredient '{ingredient.Name}'. Available: {availableQuantity}, Required: {neededQuantity}.");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            _context.Sales.Add(sale);
            sale.Items = saleItems;
            await _context.SaveChangesAsync();

            foreach (var (ingredientId, neededQuantity) in consumptionPlan)
            {
                await _inventoryService.ConsumeStockAsync(
                    new ConsumeStockRequest
                    {
                        IngredientId = ingredientId,
                        Quantity = neededQuantity,
                        ReferenceType = "SALE",
                        ReferenceId = sale.Id,
                        Reason = "Sale item consumption"
                    },
                    userId);
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        sale.Items = saleItems;
        sale.RecordedBy = user;
        return MapSale(sale);
    }

    public async Task<List<WasteRecordResponse>> GetWasteRecordsAsync(
        string? search = null,
        Guid? ingredientId = null,
        DateTime? from = null,
        DateTime? to = null,
        string sortBy = "recordedAt",
        bool descending = true,
        int page = 1,
        int pageSize = 20)
    {
        if (page < 1)
            page = 1;

        pageSize = NormalizePageSize(pageSize);

        var query = _context.WasteRecords
            .AsNoTracking()
            .Include(w => w.Ingredient)
            .Include(w => w.StockBatch)
            .Include(w => w.ReportedBy)
            .Include(w => w.ConfirmedBy)
            .AsQueryable();

        if (ingredientId.HasValue)
            query = query.Where(w => w.IngredientId == ingredientId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchText = search.Trim();
            query = query.Where(w =>
                w.Reason.Contains(searchText) ||
                w.Ingredient.Name.Contains(searchText) ||
                w.StockBatch.BatchNumber.Contains(searchText));
        }

        if (from.HasValue)
            query = query.Where(w => w.RecordedAt >= from.Value);

        if (to.HasValue)
            query = query.Where(w => w.RecordedAt <= to.Value);

        query = sortBy.ToLowerInvariant() switch
        {
            "quantity" => descending ? query.OrderByDescending(w => w.Quantity) : query.OrderBy(w => w.Quantity),
            "status" => descending ? query.OrderByDescending(w => w.Status) : query.OrderBy(w => w.Status),
            _ => descending ? query.OrderByDescending(w => w.RecordedAt) : query.OrderBy(w => w.RecordedAt)
        };

        var wasteRecords = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return wasteRecords.Select(MapWasteRecord).ToList();
    }

    public async Task<WasteRecordResponse?> GetWasteRecordByIdAsync(Guid wasteRecordId)
    {
        var wasteRecord = await _context.WasteRecords
            .AsNoTracking()
            .Include(w => w.Ingredient)
            .Include(w => w.StockBatch)
            .Include(w => w.ReportedBy)
            .Include(w => w.ConfirmedBy)
            .FirstOrDefaultAsync(w => w.Id == wasteRecordId);

        return wasteRecord == null ? null : MapWasteRecord(wasteRecord);
    }

    public async Task<WasteRecordResponse> ConfirmWasteAsync(
        Guid wasteRecordId,
        Guid confirmerId)
    {
        var wasteRecord = await _context.WasteRecords
            .Include(w => w.Ingredient)
            .Include(w => w.StockBatch)
            .Include(w => w.ReportedBy)
            .Include(w => w.ConfirmedBy)
            .FirstOrDefaultAsync(w => w.Id == wasteRecordId);

        if (wasteRecord == null)
            throw new KeyNotFoundException("Waste record not found.");

        if (wasteRecord.ConfirmedById.HasValue ||
            wasteRecord.ConfirmedAt.HasValue ||
            string.Equals(wasteRecord.Status, "CONFIRMED", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Waste record has already been confirmed.");
        }

        var confirmerExists = await _context.Users
            .AnyAsync(u => u.Id == confirmerId && u.IsActive);

        if (!confirmerExists)
            throw new InvalidOperationException("Confirming user was not found or is inactive.");

        wasteRecord.ConfirmedById = confirmerId;
        wasteRecord.ConfirmedAt = DateTime.UtcNow;
        wasteRecord.Status = "CONFIRMED";
        wasteRecord.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        wasteRecord.ConfirmedBy = await _context.Users
            .AsNoTracking()
            .FirstAsync(u => u.Id == confirmerId);

        return MapWasteRecord(wasteRecord);
    }

    public async Task<WasteRecordResponse> RecordWasteAsync(
        RecordWasteRequest request,
        Guid userId)
    {
        if (request.Quantity <= 0m)
            throw new InvalidOperationException("Waste quantity must be greater than zero.");

        var batch = await _context.StockBatches
            .Include(b => b.Ingredient)
            .FirstOrDefaultAsync(b => b.Id == request.StockBatchId);

        if (batch == null)
            throw new InvalidOperationException("Stock batch not found.");

        if (batch.Quantity < request.Quantity)
            throw new InvalidOperationException($"Insufficient stock. Available: {batch.Quantity}, Requested waste: {request.Quantity}.");

        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new InvalidOperationException("Waste reason is required.");

        await using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var wasteRecord = new WasteRecord
            {
                IngredientId = batch.IngredientId,
                StockBatchId = batch.Id,
                Quantity = request.Quantity,
                Reason = request.Reason.Trim(),
                ReportedById = userId,
                Status = "RECORDED",
                RecordedAt = DateTime.UtcNow
            };

            _context.WasteRecords.Add(wasteRecord);
            await _context.SaveChangesAsync();

            await _inventoryService.RecordWasteAsync(
                new RecordWasteRequest
                {
                    StockBatchId = request.StockBatchId,
                    Quantity = request.Quantity,
                    Reason = request.Reason,
                    ReferenceId = wasteRecord.Id
                },
                userId);

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            wasteRecord.ConfirmedBy = null;
            return MapWasteRecord(wasteRecord);
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<SalesSummaryResponse> GetSalesSummaryAsync(
        DateTime? from = null,
        DateTime? to = null)
    {
        var query = _context.Sales
            .AsNoTracking()
            .AsQueryable();

        if (from.HasValue)
            query = query.Where(s => s.SaleDate >= from.Value);

        if (to.HasValue)
            query = query.Where(s => s.SaleDate <= to.Value);

        var totalSales = await query.CountAsync();
        var totalRevenue = await query
            .Select(s => (decimal?)s.TotalAmount)
            .SumAsync() ?? 0m;
        var totalItemsSold = await query
            .SelectMany(s => s.Items)
            .Select(si => (long?)si.Quantity)
            .SumAsync() ?? 0L;

        return new SalesSummaryResponse
        {
            TotalSales = totalSales,
            TotalRevenue = totalRevenue,
            AverageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0m,
            TotalItemsSold = checked((int)totalItemsSold),
            From = from,
            To = to
        };
    }

    public async Task<WasteSummaryResponse> GetWasteSummaryAsync(
        DateTime? from = null,
        DateTime? to = null)
    {
        var query = _context.WasteRecords
            .AsNoTracking()
            .AsQueryable();

        if (from.HasValue)
            query = query.Where(w => w.RecordedAt >= from.Value);

        if (to.HasValue)
            query = query.Where(w => w.RecordedAt <= to.Value);

        var totalWasteRecords = await query.CountAsync();
        var totalWasteQuantity = await query
            .Select(w => (decimal?)w.Quantity)
            .SumAsync() ?? 0m;

        return new WasteSummaryResponse
        {
            TotalWasteRecords = totalWasteRecords,
            TotalWasteQuantity = totalWasteQuantity,
            From = from,
            To = to
        };
    }

    private static MenuItemResponse MapMenuItem(MenuItem menuItem)
    {
        return new MenuItemResponse
        {
            Id = menuItem.Id,
            Name = menuItem.Name,
            Description = menuItem.Description,
            SellingPrice = menuItem.SellingPrice,
            IsActive = menuItem.IsActive,
            RecipeCount = menuItem.Recipes?.Count ?? 0
        };
    }

    private static RecipeResponse MapRecipe(Recipe recipe)
    {
        return new RecipeResponse
        {
            Id = recipe.Id,
            MenuItemId = recipe.MenuItemId,
            MenuItemName = recipe.MenuItem?.Name ?? string.Empty,
            Version = recipe.Version,
            IsActive = recipe.IsActive,
            Ingredients = recipe.Ingredients
                .Select(ri => new RecipeIngredientResponse
                {
                    IngredientId = ri.IngredientId,
                    IngredientName = ri.Ingredient?.Name ?? string.Empty,
                    Unit = ri.Unit,
                    QuantityRequired = ri.QuantityRequired
                })
                .ToList()
        };
    }

    private static SaleResponse MapSale(Sale sale)
    {
        return new SaleResponse
        {
            Id = sale.Id,
            RecordedById = sale.RecordedById,
            RecordedByName = sale.RecordedBy != null
                ? $"{sale.RecordedBy.FirstName} {sale.RecordedBy.LastName}".Trim()
                : string.Empty,
            SaleDate = sale.SaleDate,
            TotalAmount = sale.TotalAmount,
            Status = sale.Status,
            Items = sale.Items
                .Select(MapSaleItem)
                .ToList()
        };
    }

    private static SaleItemResponse MapSaleItem(SaleItem item)
    {
        return new SaleItemResponse
        {
            Id = item.Id,
            MenuItemId = item.MenuItemId,
            MenuItemName = item.MenuItem?.Name ?? string.Empty,
            Quantity = item.Quantity,
            UnitPrice = item.UnitPrice,
            Subtotal = item.Subtotal
        };
    }

    private static WasteRecordResponse MapWasteRecord(WasteRecord wasteRecord)
    {
        return new WasteRecordResponse
        {
            Id = wasteRecord.Id,
            IngredientId = wasteRecord.IngredientId,
            IngredientName = wasteRecord.Ingredient?.Name ?? string.Empty,
            StockBatchId = wasteRecord.StockBatchId,
            StockBatchNumber = wasteRecord.StockBatch?.BatchNumber ?? string.Empty,
            Quantity = wasteRecord.Quantity,
            Reason = wasteRecord.Reason,
            ReportedById = wasteRecord.ReportedById,
            ReportedByName = wasteRecord.ReportedBy != null
                ? $"{wasteRecord.ReportedBy.FirstName} {wasteRecord.ReportedBy.LastName}".Trim()
                : string.Empty,
            Status = wasteRecord.Status,
            RecordedAt = wasteRecord.RecordedAt,
            ConfirmedById = wasteRecord.ConfirmedById,
            ConfirmedByName = wasteRecord.ConfirmedBy != null
                ? $"{wasteRecord.ConfirmedBy.FirstName} {wasteRecord.ConfirmedBy.LastName}".Trim()
                : null,
            ConfirmedAt = wasteRecord.ConfirmedAt
        };
    }
}
