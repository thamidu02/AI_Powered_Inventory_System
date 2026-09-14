using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlanningController : ControllerBase
{
    private readonly IPlanningService _planningService;

    public PlanningController(IPlanningService planningService)
    {
        _planningService = planningService;
    }

    /// <summary>
    /// Generate (or refresh) demand plans for all ingredients within the given window.
    /// Repeated calls for the same period upsert rather than duplicate.
    /// </summary>
    [HttpGet("demand")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GenerateDemandPlans(
        [FromQuery] DateTime periodStart,
        [FromQuery] DateTime periodEnd)
    {
        if (periodEnd <= periodStart)
        {
            return BadRequest(new { message = "periodEnd must be later than periodStart." });
        }

        var demandPlans =
            await _planningService.GenerateDemandPlansAsync(periodStart, periodEnd);

        return Ok(demandPlans);
    }
}
