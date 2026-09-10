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

    // =========================
    // Identity
    // =========================

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();


    // =========================
    // Inventory
    // =========================

    public DbSet<Ingredient> Ingredients => Set<Ingredient>();
    public DbSet<IngredientCategory> IngredientCategories => Set<IngredientCategory>();
    public DbSet<StorageLocation> StorageLocations => Set<StorageLocation>();
    public DbSet<StockBatch> StockBatches => Set<StockBatch>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<StockAdjustment> StockAdjustments => Set<StockAdjustment>();


    // =========================
    // Procurement
    // =========================

    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierIngredient> SupplierIngredients => Set<SupplierIngredient>();
    public DbSet<PurchaseRequest> PurchaseRequests => Set<PurchaseRequest>();
    public DbSet<PurchaseRequestItem> PurchaseRequestItems => Set<PurchaseRequestItem>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<GoodsReceiptItem> GoodsReceiptItems => Set<GoodsReceiptItem>();


    // =========================
    // Sales & Waste
    // =========================

    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<Recipe> Recipes => Set<Recipe>();
    public DbSet<RecipeIngredient> RecipeIngredients => Set<RecipeIngredient>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<WasteRecord> WasteRecords => Set<WasteRecord>();


    // =========================
    // Planning
    // =========================

    public DbSet<ReorderRule> ReorderRules => Set<ReorderRule>();
    public DbSet<DemandPlan> DemandPlans => Set<DemandPlan>();


    // =========================
    // Agentic AI
    // =========================

    public DbSet<AIWorkflow> AIWorkflows => Set<AIWorkflow>();
    public DbSet<AIWorkflowStep> AIWorkflowSteps => Set<AIWorkflowStep>();
    public DbSet<AIApproval> AIApprovals => Set<AIApproval>();


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);


        // ============================================================
        // IDENTITY
        // ============================================================

        modelBuilder.Entity<Role>()
            .HasIndex(r => r.Name)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();


        // INVENTORY
 
        // Ingredient
        modelBuilder.Entity<Ingredient>()
            .HasIndex(i => i.SKU)
            .IsUnique();

        modelBuilder.Entity<Ingredient>()
            .HasOne(i => i.Category)
            .WithMany(c => c.Ingredients)
            .HasForeignKey(i => i.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);


   
        // Stock Batch
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

        modelBuilder.Entity<StockBatch>()
            .HasOne(b => b.GoodsReceipt)
            .WithMany()
            .HasForeignKey(b => b.GoodsReceiptId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockBatch>()
            .HasIndex(b => new
            {
                b.IngredientId,
                b.Status
            });

        modelBuilder.Entity<StockBatch>()
            .HasIndex(b => b.ExpiryDate);


  
        // Stock Movement
        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.Ingredient)
            .WithMany(i => i.StockMovements)
            .HasForeignKey(m => m.IngredientId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.StockBatch)
            .WithMany(b => b.StockMovements)
            .HasForeignKey(m => m.StockBatchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.StorageLocation)
            .WithMany()
            .HasForeignKey(m => m.StorageLocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockMovement>()
            .HasOne(m => m.CreatedBy)
            .WithMany()
            .HasForeignKey(m => m.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockMovement>()
            .HasIndex(m => new
            {
                m.IngredientId,
                m.CreatedAt
            });



        // Stock Adjustment
        modelBuilder.Entity<StockAdjustment>()
            .HasOne(a => a.Ingredient)
            .WithMany()
            .HasForeignKey(a => a.IngredientId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockAdjustment>()
            .HasOne(a => a.StockBatch)
            .WithMany()
            .HasForeignKey(a => a.StockBatchId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockAdjustment>()
            .HasOne(a => a.RequestedBy)
            .WithMany()
            .HasForeignKey(a => a.RequestedById)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockAdjustment>()
            .HasOne(a => a.ApprovedBy)
            .WithMany()
            .HasForeignKey(a => a.ApprovedById)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<StockAdjustment>()
            .HasIndex(a => new
            {
                a.Status,
                a.CreatedAt
            });


        // PROCUREMENT
        modelBuilder.Entity<SupplierIngredient>()
            .HasIndex(x => new
            {
                x.SupplierId,
                x.IngredientId
            })
            .IsUnique();



        // SALES


        modelBuilder.Entity<RecipeIngredient>()
            .HasIndex(x => new
            {
                x.RecipeId,
                x.IngredientId
            })
            .IsUnique();


        // AGENTIC AI


        modelBuilder.Entity<AIWorkflowStep>()
            .HasIndex(x => new
            {
                x.WorkflowId,
                x.StepNumber
            })
            .IsUnique();


 
        // DECIMAL PRECISION
        // Inventory

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

        modelBuilder.Entity<StockAdjustment>()
            .Property(x => x.QuantityChange)
            .HasPrecision(18, 3);


        // Procurement

        modelBuilder.Entity<SupplierIngredient>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrder>()
            .Property(x => x.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<PurchaseOrderItem>()
            .Property(x => x.UnitPrice)
            .HasPrecision(18, 2);


        // Sales

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


        // ============================================================
        // DATABASE CHECK CONSTRAINTS
        // ============================================================

        // Ingredient constraints

        modelBuilder.Entity<Ingredient>()
            .ToTable("Ingredients", table =>
            {
                table.HasCheckConstraint(
                    "CK_Ingredient_MinimumStockLevel_NonNegative",
                    "\"MinimumStockLevel\" >= 0");

                table.HasCheckConstraint(
                    "CK_Ingredient_MaximumStockLevel_Valid",
                    "\"MaximumStockLevel\" >= \"MinimumStockLevel\"");
            });


        // Stock batch constraints

        modelBuilder.Entity<StockBatch>()
            .ToTable("StockBatches", table =>
            {
                table.HasCheckConstraint(
                    "CK_StockBatch_Quantity_NonNegative",
                    "\"Quantity\" >= 0");

                table.HasCheckConstraint(
                    "CK_StockBatch_UnitCost_NonNegative",
                    "\"UnitCost\" >= 0");
            });


        // Stock movement constraints

        modelBuilder.Entity<StockMovement>()
            .ToTable("StockMovements", table =>
            {
                table.HasCheckConstraint(
                    "CK_StockMovement_Quantity_Positive",
                    "\"Quantity\" > 0");
            });


        // Stock adjustment constraints

        modelBuilder.Entity<StockAdjustment>()
            .ToTable("StockAdjustments", table =>
            {
                table.HasCheckConstraint(
                    "CK_StockAdjustment_QuantityChange_NonZero",
                    "\"QuantityChange\" <> 0");
            });
    }
}