using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Sales;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SalesController : ControllerBase
{
    private readonly ISalesService _salesService;

    public SalesController(ISalesService salesService)
    {
        _salesService = salesService;
    }

    [HttpGet("menu-items")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetMenuItems()
    {
        return Ok(await _salesService.GetMenuItemsAsync());
    }

    [HttpGet("menu-items/{menuItemId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetMenuItem(Guid menuItemId)
    {
        var result = await _salesService.GetMenuItemByIdAsync(menuItemId);

        if (result == null)
            return NotFound(new { message = "Menu item not found." });

        return Ok(result);
    }

    [HttpGet("menu-items/{menuItemId:guid}/recipe")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetMenuItemRecipe(Guid menuItemId)
    {
        var result = await _salesService.GetActiveRecipeAsync(menuItemId);

        if (result == null)
            return NotFound(new { message = "Active recipe not found for this menu item." });

        return Ok(result);
    }

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetSales(
        [FromQuery] string? search = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] string sortBy = "saleDate",
        [FromQuery] bool descending = true,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        return Ok(await _salesService.GetSalesAsync(search, from, to, sortBy, descending, page, pageSize));
    }

    [HttpGet("summary")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetSalesSummary(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        return Ok(await _salesService.GetSalesSummaryAsync(from, to));
    }

    [HttpGet("{saleId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid saleId)
    {
        var result = await _salesService.GetSaleByIdAsync(saleId);

        if (result == null)
            return NotFound(new { message = "Sale not found." });

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "RESTAURANT_MANAGER")]
    public async Task<IActionResult> CreateSale([FromBody] CreateSaleRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _salesService.CreateSaleAsync(request, userId);

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private Guid GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var parsed))
            throw new InvalidOperationException("Unable to determine current user.");

        return parsed;
    }
}
