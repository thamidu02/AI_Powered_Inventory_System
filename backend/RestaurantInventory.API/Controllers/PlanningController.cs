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

    /// <summary>
    /// Get detailed inventory-aware forecast including current stock, projected shortage, and recommendations.
    /// </summary>
    [HttpGet("forecast")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetDetailedForecast(
        [FromQuery] DateTime periodStart,
        [FromQuery] DateTime periodEnd)
    {
        if (periodEnd <= periodStart)
        {
            return BadRequest(new { message = "periodEnd must be later than periodStart." });
        }

        var forecast =
            await _planningService.GetDetailedDemandPlansAsync(periodStart, periodEnd);

        return Ok(forecast);
    }

    /// <summary>
    /// Get reorder recommendations for items needing replenishment based on min/max stock rules.
    /// </summary>
    [HttpGet("recommendations")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetRecommendations(
        [FromQuery] DateTime periodStart,
        [FromQuery] DateTime periodEnd)
    {
        if (periodEnd <= periodStart)
        {
            return BadRequest(new { message = "periodEnd must be later than periodStart." });
        }

        var recommendations =
            await _planningService.GetRecommendationsAsync(periodStart, periodEnd);

        return Ok(recommendations);
    }

    /// <summary>
    /// Get risk analytics summary (stock risk, overstock, high demand) for inventory management.
    /// </summary>
    [HttpGet("risks")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetRisks(
        [FromQuery] DateTime periodStart,
        [FromQuery] DateTime periodEnd)
    {
        if (periodEnd <= periodStart)
        {
            return BadRequest(new { message = "periodEnd must be later than periodStart." });
        }

        var risks =
            await _planningService.GetRiskAnalyticsAsync(periodStart, periodEnd);

        return Ok(risks);
    }

    /// <summary>
    /// Get daily historical ingredient demand records built from sales × recipe consumption.
    /// Used by the ML demand forecasting pipeline in the AI service.
    /// </summary>
    [HttpGet("demand-history")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetDemandHistory(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] Guid? ingredientId = null)
    {
        var historyFrom = from.HasValue
            ? DateTime.SpecifyKind(from.Value, DateTimeKind.Utc)
            : DateTime.UtcNow.AddDays(-60);
        var historyTo = to.HasValue
            ? DateTime.SpecifyKind(to.Value, DateTimeKind.Utc)
            : DateTime.UtcNow;

        var records = await _planningService.GetDemandHistoryAsync(historyFrom, historyTo, ingredientId);
        return Ok(records);
    }
}

