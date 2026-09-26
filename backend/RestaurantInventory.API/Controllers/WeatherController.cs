using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WeatherController : ControllerBase
{
    private readonly IWeatherService _weatherService;

    public WeatherController(IWeatherService weatherService)
    {
        _weatherService = weatherService;
    }

    /// <summary>
    /// Gets current meteorological conditions and immediate category demand impacts.
    /// </summary>
    [HttpGet("current")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetCurrentWeather([FromQuery] string? city = null)
    {
        var result = await _weatherService.GetCurrentWeatherAsync(city);
        return Ok(result);
    }

    /// <summary>
    /// Gets 5-day predictive weather forecast with daily category demand multipliers.
    /// </summary>
    [HttpGet("forecast")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetWeatherForecast([FromQuery] string? city = null)
    {
        var result = await _weatherService.GetWeatherForecastAsync(city);
        return Ok(result);
    }

    /// <summary>
    /// Gets weather demand impact multipliers for comfort food, beverages, and produce.
    /// </summary>
    [HttpGet("impact")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetDemandImpact([FromQuery] string? city = null)
    {
        var result = await _weatherService.GetDemandImpactAsync(city);
        return Ok(result);
    }
}
