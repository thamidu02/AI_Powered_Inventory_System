using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantInventory.API.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryAdjustmentsAndTraceability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_StockBatches_StockBatchId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_StorageLocations_StorageLocationId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_Users_CreatedById",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_IngredientId",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockBatches_IngredientId",
                table: "StockBatches");

            migrationBuilder.AddColumn<Guid>(
                name: "GoodsReceiptId",
                table: "StockBatches",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StockAdjustments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    IngredientId = table.Column<Guid>(type: "uuid", nullable: false),
                    StockBatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityChange = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    RequestedById = table.Column<Guid>(type: "uuid", nullable: false),
                    ApprovedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockAdjustments", x => x.Id);
                    table.CheckConstraint("CK_StockAdjustment_QuantityChange_NonZero", "\"QuantityChange\" <> 0");
                    table.ForeignKey(
                        name: "FK_StockAdjustments_Ingredients_IngredientId",
                        column: x => x.IngredientId,
                        principalTable: "Ingredients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockAdjustments_StockBatches_StockBatchId",
                        column: x => x.StockBatchId,
                        principalTable: "StockBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockAdjustments_Users_ApprovedById",
                        column: x => x.ApprovedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockAdjustments_Users_RequestedById",
                        column: x => x.RequestedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_IngredientId_CreatedAt",
                table: "StockMovements",
                columns: new[] { "IngredientId", "CreatedAt" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockMovement_Quantity_Positive",
                table: "StockMovements",
                sql: "\"Quantity\" > 0");

            migrationBuilder.CreateIndex(
                name: "IX_StockBatches_ExpiryDate",
                table: "StockBatches",
                column: "ExpiryDate");

            migrationBuilder.CreateIndex(
                name: "IX_StockBatches_GoodsReceiptId",
                table: "StockBatches",
                column: "GoodsReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_StockBatches_IngredientId_Status",
                table: "StockBatches",
                columns: new[] { "IngredientId", "Status" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockBatch_Quantity_NonNegative",
                table: "StockBatches",
                sql: "\"Quantity\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockBatch_UnitCost_NonNegative",
                table: "StockBatches",
                sql: "\"UnitCost\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Ingredient_MaximumStockLevel_Valid",
                table: "Ingredients",
                sql: "\"MaximumStockLevel\" >= \"MinimumStockLevel\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Ingredient_MinimumStockLevel_NonNegative",
                table: "Ingredients",
                sql: "\"MinimumStockLevel\" >= 0");

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustments_ApprovedById",
                table: "StockAdjustments",
                column: "ApprovedById");

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustments_IngredientId",
                table: "StockAdjustments",
                column: "IngredientId");

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustments_RequestedById",
                table: "StockAdjustments",
                column: "RequestedById");

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustments_Status_CreatedAt",
                table: "StockAdjustments",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StockAdjustments_StockBatchId",
                table: "StockAdjustments",
                column: "StockBatchId");

            migrationBuilder.AddForeignKey(
                name: "FK_StockBatches_GoodsReceipts_GoodsReceiptId",
                table: "StockBatches",
                column: "GoodsReceiptId",
                principalTable: "GoodsReceipts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_StockBatches_StockBatchId",
                table: "StockMovements",
                column: "StockBatchId",
                principalTable: "StockBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_StorageLocations_StorageLocationId",
                table: "StockMovements",
                column: "StorageLocationId",
                principalTable: "StorageLocations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_Users_CreatedById",
                table: "StockMovements",
                column: "CreatedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StockBatches_GoodsReceipts_GoodsReceiptId",
                table: "StockBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_StockBatches_StockBatchId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_StorageLocations_StorageLocationId",
                table: "StockMovements");

            migrationBuilder.DropForeignKey(
                name: "FK_StockMovements_Users_CreatedById",
                table: "StockMovements");

            migrationBuilder.DropTable(
                name: "StockAdjustments");

            migrationBuilder.DropIndex(
                name: "IX_StockMovements_IngredientId_CreatedAt",
                table: "StockMovements");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockMovement_Quantity_Positive",
                table: "StockMovements");

            migrationBuilder.DropIndex(
                name: "IX_StockBatches_ExpiryDate",
                table: "StockBatches");

            migrationBuilder.DropIndex(
                name: "IX_StockBatches_GoodsReceiptId",
                table: "StockBatches");

            migrationBuilder.DropIndex(
                name: "IX_StockBatches_IngredientId_Status",
                table: "StockBatches");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockBatch_Quantity_NonNegative",
                table: "StockBatches");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockBatch_UnitCost_NonNegative",
                table: "StockBatches");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Ingredient_MaximumStockLevel_Valid",
                table: "Ingredients");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Ingredient_MinimumStockLevel_NonNegative",
                table: "Ingredients");

            migrationBuilder.DropColumn(
                name: "GoodsReceiptId",
                table: "StockBatches");

            migrationBuilder.CreateIndex(
                name: "IX_StockMovements_IngredientId",
                table: "StockMovements",
                column: "IngredientId");

            migrationBuilder.CreateIndex(
                name: "IX_StockBatches_IngredientId",
                table: "StockBatches",
                column: "IngredientId");

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_StockBatches_StockBatchId",
                table: "StockMovements",
                column: "StockBatchId",
                principalTable: "StockBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_StorageLocations_StorageLocationId",
                table: "StockMovements",
                column: "StorageLocationId",
                principalTable: "StorageLocations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StockMovements_Users_CreatedById",
                table: "StockMovements",
                column: "CreatedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
