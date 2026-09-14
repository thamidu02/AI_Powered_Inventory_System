using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PurchaseOrdersController : ControllerBase
{
    private readonly IPurchaseOrderService _service;

    public PurchaseOrdersController(IPurchaseOrderService service)
    {
        _service = service;
    }

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetAll([FromQuery] string? status = null)
    {
        var result = await _service.GetAllAsync(status);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var result = await _service.GetByIdAsync(id);
        if (result == null)
        {
            return NotFound(new { message = "Purchase order not found." });
        }

        return Ok(result);
    }

    [HttpPost]
    [Authorize(Roles = "SYSTEM_ADMIN,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseOrderRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _service.CreateAsync(request, userId);

            return CreatedAtAction(
                nameof(GetById),
                new { id = result.Id },
                result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdatePurchaseOrderRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _service.UpdateAsync(id, request, userId);
            if (result == null)
            {
                return NotFound(new { message = "Purchase order not found." });
            }

            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/submit")]
    [Authorize(Roles = "SYSTEM_ADMIN,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> Submit(Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _service.SubmitAsync(id, userId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SYSTEM_ADMIN")]
    public async Task<IActionResult> Approve(Guid id)
    {
        try
        {
            var approverId = GetCurrentUserId();
            var result = await _service.ApproveAsync(id, approverId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = "RESTAURANT_MANAGER,SYSTEM_ADMIN")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectPurchaseOrderRequest? request = null)
    {
        try
        {
            var approverId = GetCurrentUserId();
            var result = await _service.RejectAsync(id, request, approverId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/order")]
    [HttpPost("{id:guid}/mark-as-ordered")]
    [Authorize(Roles = "SYSTEM_ADMIN,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> MarkAsOrdered(Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _service.MarkAsOrderedAsync(id, userId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _service.CancelAsync(id, userId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var deleted = await _service.DeleteAsync(id, userId);
            if (!deleted)
            {
                return NotFound(new { message = "Purchase order not found." });
            }

            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private Guid GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            throw new UnauthorizedAccessException("Invalid user identity.");
        }

        return parsedUserId;
    }
}
