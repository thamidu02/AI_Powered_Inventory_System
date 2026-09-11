using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Sales;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class RecipesController : ControllerBase
{
    private readonly ISalesService _salesService;

    public RecipesController(ISalesService salesService)
    {
        _salesService = salesService;
    }

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _salesService.GetRecipesAsync());
    }

    [HttpGet("{recipeId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid recipeId)
    {
        var result = await _salesService.GetRecipeByIdAsync(recipeId);
        return result == null
            ? NotFound(new { message = "Recipe not found." })
            : Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Create([FromBody] CreateRecipeRequest request)
    {
        try
        {
            var result = await _salesService.CreateRecipeAsync(request);
            return CreatedAtAction(nameof(GetById), new { recipeId = result.Id }, result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{recipeId:guid}")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Update(
        Guid recipeId,
        [FromBody] UpdateRecipeRequest request)
    {
        try
        {
            var result = await _salesService.UpdateRecipeAsync(recipeId, request);
            return result == null
                ? NotFound(new { message = "Recipe not found." })
                : Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{recipeId:guid}")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> Delete(Guid recipeId)
    {
        var deleted = await _salesService.DeleteRecipeAsync(recipeId);
        return deleted
            ? NoContent()
            : NotFound(new { message = "Recipe not found." });
    }

    [HttpGet("menu-item/{menuItemId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetByMenuItem(Guid menuItemId)
    {
        var result = await _salesService.GetActiveRecipeAsync(menuItemId);

        if (result == null)
            return NotFound(new { message = "Active recipe not found for this menu item." });

        return Ok(result);
    }
}
