using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RestaurantInventory.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveIngredientIsActive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Ingredients");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Ingredients",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
