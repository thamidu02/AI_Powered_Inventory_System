using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WasteRecordsController : ControllerBase
{
    private readonly ISalesService _salesService;

    public WasteRecordsController(ISalesService salesService)
    {
        _salesService = salesService;
    }

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetWasteRecords()
    {
        return Ok(await _salesService.GetWasteRecordsAsync());
    }

    [HttpGet("summary")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetWasteSummary(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        return Ok(await _salesService.GetWasteSummaryAsync(from, to));
    }

    [HttpGet("{wasteRecordId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetById(Guid wasteRecordId)
    {
        var result = await _salesService.GetWasteRecordByIdAsync(wasteRecordId);

        if (result == null)
            return NotFound(new { message = "Waste record not found." });

        return Ok(result);
    }

    [HttpPost("{wasteRecordId:guid}/confirm")]
    [Authorize(Roles = "INVENTORY_MANAGER,RESTAURANT_MANAGER")]
    public async Task<IActionResult> Confirm(Guid wasteRecordId)
    {
        try
        {
            var confirmerId = GetCurrentUserId();
            var result = await _salesService.ConfirmWasteAsync(
                wasteRecordId,
                confirmerId);

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

    [HttpPost]
    [Authorize(Roles = "SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> CreateWasteRecord([FromBody] RecordWasteRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _salesService.RecordWasteAsync(request, userId);

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
