using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantInventory.API.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseRequestIdToPurchaseOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseRequestId",
                table: "PurchaseOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_PurchaseRequestId",
                table: "PurchaseOrders",
                column: "PurchaseRequestId");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrders_PurchaseRequests_PurchaseRequestId",
                table: "PurchaseOrders",
                column: "PurchaseRequestId",
                principalTable: "PurchaseRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrders_PurchaseRequests_PurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_PurchaseRequestId",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "PurchaseRequestId",
                table: "PurchaseOrders");
        }
    }
}
