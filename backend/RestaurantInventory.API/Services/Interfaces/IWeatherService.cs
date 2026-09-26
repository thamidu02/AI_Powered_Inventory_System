using RestaurantInventory.API.DTOs.Weather;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IWeatherService
{
    Task<CurrentWeatherResponse> GetCurrentWeatherAsync(string? city = null);
    Task<WeatherForecastSummaryResponse> GetWeatherForecastAsync(string? city = null);
    Task<WeatherDemandImpact> GetDemandImpactAsync(string? city = null);
}
