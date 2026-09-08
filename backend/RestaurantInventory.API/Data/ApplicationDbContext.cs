using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Models.AI;
using RestaurantInventory.API.Models.Identity;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Models.Planning;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Models.Sales;

namespace RestaurantInventory.API.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    // Identity
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();

    // Inventory
    public DbSet<Ingredient> Ingredients => Set<Ingredient>();
    public DbSet<IngredientCategory> IngredientCategories => Set<IngredientCategory>();
    public DbSet<StorageLocation> StorageLocations => Set<StorageLocation>();
    public DbSet<StockBatch> StockBatches => Set<StockBatch>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();

    // Procurement
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierIngredient> SupplierIngredients => Set<SupplierIngredient>();
    public DbSet<PurchaseRequest> PurchaseRequests => Set<PurchaseRequest>();
    public DbSet<PurchaseRequestItem> PurchaseRequestItems => Set<PurchaseRequestItem>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<GoodsReceiptItem> GoodsReceiptItems => Set<GoodsReceiptItem>();

    // Sales
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<Recipe> Recipes => Set<Recipe>();
    public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<WasteRecord> WasteRecords => Set<WasteRecord>();

    // Planning
    public DbSet<ReorderRule> ReorderRules => Set<ReorderRule>();
    public DbSet<DemandPlan> DemandPlans => Set<DemandPlan>();

    // AI
    public DbSet<AIWorkflow> AIWorkflows => Set<AIWorkflow>();
    public DbSet<AIWorkflowStep> AIWorkflowSteps => Set<AIWorkflowStep>();
    public DbSet<AIApproval> AIApprovals => Set<AIApproval>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Role>()
            .HasIndex(r => r.Name)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<Ingredient>()
            .HasIndex(i => i.SKU)
            .IsUnique();

        modelBuilder.Entity<Ingredient>()
            .HasOne(i => i.Category)
            .WithMany(c => c.Ingredients)
            .HasForeignKey(i => i.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockBatch>()
            .HasOne(b => b.Ingredient)
            .WithMany(i => i.StockBatches)
            .HasForeignKey(b => b.IngredientId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockBatch>()
            .HasOne(b => b.StorageLocation)
            .WithMany(s => s.StockBatches)
            .HasForeignKey(b => b.StorageLocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.Ingredient)
            .WithMany(i => i.StockMovements)
            .HasForeignKey(m => m.IngredientId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<SupplierIngredient>()
            .HasIndex(x => new { x.SupplierId, x.IngredientId })
            .IsUnique();

        modelBuilder.Entity<RecipeIngredient>()
            .HasIndex(x => new { x.RecipeId, x.IngredientId })
            .IsUnique();

        modelBuilder.Entity<AIWorkflowStep>()
            .HasIndex(x => new { x.WorkflowId, x.StepNumber })
            .IsUnique();

        // Decimal precision
        modelBuilder.Entity<Ingredient>()
            .Property(x => x.MinimumStockLevel)
            .HasPrecision(18, 3);

        modelBuilder.Entity<Ingredient>()
            .Property(x => x.MaximumStockLevel)
            .HasPrecision(18, 3);

        modelBuilder.Entity<StockBatch>()
            .Property(x => x.Quantity)
            .HasPrecision(18, 3);

        modelBuilder.Entity<StockBatch>()
            .Property(x => x.UnitCost)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SupplierIngredient>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderItem>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Sale>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<MenuItem>()
            .Property(x => x.SellingPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SaleItem>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<SaleItem>()
            .Property(x => x.Subtotal)
            .HasPrecision(18, 2);
    }
}