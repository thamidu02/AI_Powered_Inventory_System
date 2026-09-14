using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Sales;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MenuItemsController : ControllerBase
{
    private readonly ISalesService _salesService;

    public MenuItemsController(ISalesService salesService)
    {
        _salesService = salesService;
    }

    [HttpPost]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Create(
        [FromBody] CreateMenuItemRequest request)
    {
        try
        {
            var result = await _salesService.CreateMenuItemAsync(request);
            return CreatedAtAction(
                nameof(GetById),
                new { menuItemId = result.Id },
                result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _salesService.GetMenuItemsAsync());
    }

    [HttpGet("{menuItemId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid menuItemId)
    {
        var result = await _salesService.GetMenuItemByIdAsync(menuItemId);

        if (result == null)
            return NotFound(new { message = "Menu item not found." });

        return Ok(result);
    }

    [HttpPut("{menuItemId:guid}")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Update(
        Guid menuItemId,
        [FromBody] UpdateMenuItemRequest request)
    {
        return await UpdateInternal(menuItemId, request);
    }

    [HttpDelete("{menuItemId:guid}")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Delete(Guid menuItemId)
    {
        return await DeleteInternal(menuItemId);
    }

    private async Task<IActionResult> UpdateInternal(
        Guid menuItemId,
        UpdateMenuItemRequest request)
    {
        try
        {
            var result = await _salesService.UpdateMenuItemAsync(
                menuItemId,
                request);

            if (result == null)
                return NotFound(new { message = "Menu item not found." });

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private async Task<IActionResult> DeleteInternal(Guid menuItemId)
    {
        try
        {
            var deleted = await _salesService.DeleteMenuItemAsync(menuItemId);

            if (!deleted)
                return NotFound(new { message = "Menu item not found." });

            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}
