using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class IngredientCategoriesController : ControllerBase
{
    private readonly IIngredientCategoryService _service;

    public IngredientCategoriesController(
        IIngredientCategoryService service)
    {
        _service = service;
    }

    [HttpGet]
    [Authorize(Roles =
        "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _service.GetAllAsync());
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles =
        "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);

        if (result == null)
        {
            return NotFound(new
            {
                message = "Ingredient category not found."
            });
        }

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER")]
    public async Task<IActionResult> Create(
        CreateCategoryRequest request)
    {
        try
        {
            var result = await _service.CreateAsync(request);

            return CreatedAtAction(
                nameof(GetById),
                new { id = result.Id },
                result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                message = ex.Message
            });
        }
    }

    [HttpPut("{id:guid}")]
    [HttpPost("{id:guid}")]
    [HttpPost("{id:guid}/edit")]
    [HttpPost("{id:guid}/update")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER")]
    public async Task<IActionResult> Update(
        Guid id,
        UpdateCategoryRequest request)
    {
        try
        {
            var result = await _service.UpdateAsync(id, request);

            if (result == null)
            {
                return NotFound(new
                {
                    message = "Ingredient category not found."
                });
            }

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                message = ex.Message
            });
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var deleted = await _service.DeleteAsync(id);

            if (!deleted)
            {
                return NotFound(new
                {
                    message = "Ingredient category not found."
                });
            }

            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new
            {
                message = ex.Message
            });
        }
    }
}