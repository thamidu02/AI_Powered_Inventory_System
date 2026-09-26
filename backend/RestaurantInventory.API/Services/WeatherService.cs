using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using RestaurantInventory.API.DTOs.Weather;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class WeatherService : IWeatherService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly ILogger<WeatherService> _logger;

    public WeatherService(
        HttpClient httpClient,
        IConfiguration configuration,
        IMemoryCache cache,
        ILogger<WeatherService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _cache = cache;
        _logger = logger;
    }

    public async Task<CurrentWeatherResponse> GetCurrentWeatherAsync(string? city = null)
    {
        var targetCity = string.IsNullOrWhiteSpace(city)
            ? _configuration["OpenWeatherMap:City"] ?? "London"
            : city;

        var cacheKey = $"weather_current_{targetCity.ToLowerInvariant()}";
        if (_cache.TryGetValue(cacheKey, out CurrentWeatherResponse? cached) && cached != null)
        {
            return cached;
        }

        var apiKey = _configuration["OpenWeatherMap:ApiKey"];
        CurrentWeatherResponse result;

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                var units = _configuration["OpenWeatherMap:Units"] ?? "metric";
                var url = $"https://api.openweathermap.org/data/2.5/weather?q={Uri.EscapeDataString(targetCity)}&units={units}&appid={apiKey}";
                
                var response = await _httpClient.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    result = ParseOpenWeatherCurrent(doc.RootElement, targetCity);
                }
                else
                {
                    _logger.LogWarning("OpenWeatherMap returned {Status}. Falling back to simulation.", response.StatusCode);
                    result = GenerateSimulatedCurrentWeather(targetCity);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch OpenWeatherMap current weather. Falling back to simulation.");
                result = GenerateSimulatedCurrentWeather(targetCity);
            }
        }
        else
        {
            result = GenerateSimulatedCurrentWeather(targetCity);
        }

        var cacheMinutes = int.TryParse(_configuration["OpenWeatherMap:CacheDurationMinutes"], out var m) ? m : 60;
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(cacheMinutes));

        return result;
    }

    public async Task<WeatherForecastSummaryResponse> GetWeatherForecastAsync(string? city = null)
    {
        var targetCity = string.IsNullOrWhiteSpace(city)
            ? _configuration["OpenWeatherMap:City"] ?? "London"
            : city;

        var cacheKey = $"weather_forecast_{targetCity.ToLowerInvariant()}";
        if (_cache.TryGetValue(cacheKey, out WeatherForecastSummaryResponse? cached) && cached != null)
        {
            return cached;
        }

        var apiKey = _configuration["OpenWeatherMap:ApiKey"];
        WeatherForecastSummaryResponse result;

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                var units = _configuration["OpenWeatherMap:Units"] ?? "metric";
                var url = $"https://api.openweathermap.org/data/2.5/forecast?q={Uri.EscapeDataString(targetCity)}&units={units}&appid={apiKey}";

                var response = await _httpClient.GetAsync(url);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    var current = await GetCurrentWeatherAsync(targetCity);
                    result = ParseOpenWeatherForecast(doc.RootElement, targetCity, current);
                }
                else
                {
                    _logger.LogWarning("OpenWeatherMap forecast returned {Status}. Falling back to simulation.", response.StatusCode);
                    result = await GenerateSimulatedForecastAsync(targetCity);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to fetch OpenWeatherMap forecast. Falling back to simulation.");
                result = await GenerateSimulatedForecastAsync(targetCity);
            }
        }
        else
        {
            result = await GenerateSimulatedForecastAsync(targetCity);
        }

        var cacheMinutes = int.TryParse(_configuration["OpenWeatherMap:CacheDurationMinutes"], out var m) ? m : 60;
        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(cacheMinutes));

        return result;
    }

    public async Task<WeatherDemandImpact> GetDemandImpactAsync(string? city = null)
    {
        var current = await GetCurrentWeatherAsync(city);
        return current.DemandImpact;
    }

    // ── OpenWeather JSON Parsers ──────────────────────────────────────────

    private CurrentWeatherResponse ParseOpenWeatherCurrent(JsonElement root, string city)
    {
        var weatherElem = root.GetProperty("weather")[0];
        var mainElem = root.GetProperty("main");
        var windElem = root.TryGetProperty("wind", out var w) ? w : default;

        var condition = weatherElem.GetProperty("main").GetString() ?? "Clear";
        var description = weatherElem.GetProperty("description").GetString() ?? "";
        var icon = weatherElem.GetProperty("icon").GetString() ?? "01d";
        var temp = (decimal)mainElem.GetProperty("temp").GetDouble();
        var feelsLike = (decimal)mainElem.GetProperty("feels_like").GetDouble();
        var tempMin = (decimal)mainElem.GetProperty("temp_min").GetDouble();
        var tempMax = (decimal)mainElem.GetProperty("temp_max").GetDouble();
        var humidity = mainElem.GetProperty("humidity").GetInt32();
        var windSpeed = windElem.ValueKind != JsonValueKind.Undefined && windElem.TryGetProperty("speed", out var ws)
            ? (decimal)ws.GetDouble()
            : 0m;

        var rainProb = condition.Contains("Rain", StringComparison.OrdinalIgnoreCase) ||
                       condition.Contains("Thunderstorm", StringComparison.OrdinalIgnoreCase)
            ? 85m
            : 10m;

        var impact = ComputeDemandImpact(condition, temp);

        return new CurrentWeatherResponse
        {
            City = root.TryGetProperty("name", out var n) ? n.GetString() ?? city : city,
            Country = root.TryGetProperty("sys", out var sys) && sys.TryGetProperty("country", out var c) ? c.GetString() ?? "" : "",
            Temperature = Math.Round(temp, 1),
            FeelsLike = Math.Round(feelsLike, 1),
            TempMin = Math.Round(tempMin, 1),
            TempMax = Math.Round(tempMax, 1),
            Humidity = humidity,
            Condition = condition,
            Description = description,
            Icon = icon,
            WindSpeed = Math.Round(windSpeed, 1),
            RainProbability = rainProb,
            RecordedAt = DateTime.UtcNow,
            DemandImpact = impact,
            IsSimulated = false,
        };
    }

    private WeatherForecastSummaryResponse ParseOpenWeatherForecast(
        JsonElement root,
        string city,
        CurrentWeatherResponse current)
    {
        var list = root.GetProperty("list");
        var dailyMap = new Dictionary<string, List<JsonElement>>();

        foreach (var item in list.EnumerateArray())
        {
            var dtText = item.GetProperty("dt_txt").GetString() ?? "";
            if (dtText.Length >= 10)
            {
                var dateKey = dtText.Substring(0, 10);
                if (!dailyMap.ContainsKey(dateKey))
                {
                    dailyMap[dateKey] = new List<JsonElement>();
                }
                dailyMap[dateKey].Add(item);
            }
        }

        var forecastDays = new List<DailyWeatherForecastResponse>();

        foreach (var kvp in dailyMap.Take(5))
        {
            var date = DateTime.Parse(kvp.Key);
            var items = kvp.Value;
            var minTemp = items.Min(i => (decimal)i.GetProperty("main").GetProperty("temp_min").GetDouble());
            var maxTemp = items.Max(i => (decimal)i.GetProperty("main").GetProperty("temp_max").GetDouble());

            var midItem = items[items.Count / 2];
            var weatherObj = midItem.GetProperty("weather")[0];
            var condition = weatherObj.GetProperty("main").GetString() ?? "Clear";
            var description = weatherObj.GetProperty("description").GetString() ?? "";
            var icon = weatherObj.GetProperty("icon").GetString() ?? "01d";
            var avgTemp = (minTemp + maxTemp) / 2m;

            var pop = midItem.TryGetProperty("pop", out var p) ? (decimal)(p.GetDouble() * 100) : 0m;
            var impact = ComputeDemandImpact(condition, avgTemp);

            forecastDays.Add(new DailyWeatherForecastResponse
            {
                Date = date,
                DayOfWeek = date.DayOfWeek.ToString(),
                TempMin = Math.Round(minTemp, 1),
                TempMax = Math.Round(maxTemp, 1),
                Condition = condition,
                Description = description,
                Icon = icon,
                RainProbability = Math.Round(pop, 0),
                ComfortFoodMultiplier = impact.ComfortFoodMultiplier,
                ColdBeverageMultiplier = impact.ColdBeverageMultiplier,
                SaladProduceMultiplier = impact.SaladProduceMultiplier,
                Recommendation = impact.RecommendationNote,
            });
        }

        return new WeatherForecastSummaryResponse
        {
            City = city,
            Current = current,
            Forecast = forecastDays,
            OverallRecommendation = current.DemandImpact.RecommendationNote,
            IsSimulated = false,
        };
    }

    // ── Resilient Simulation Fallback ──────────────────────────────────────

    private CurrentWeatherResponse GenerateSimulatedCurrentWeather(string city)
    {
        var now = DateTime.UtcNow;
        var isRainySeason = now.Month >= 4 && now.Month <= 10;
        var temp = isRainySeason ? 22.5m : 14.0m;
        var condition = isRainySeason ? "Rain" : "Clouds";
        var description = isRainySeason ? "light rain and scattered showers" : "broken clouds";
        var icon = isRainySeason ? "10d" : "03d";
        var rainProb = isRainySeason ? 75m : 25m;

        var impact = ComputeDemandImpact(condition, temp);

        return new CurrentWeatherResponse
        {
            City = city,
            Country = "DEMO",
            Temperature = temp,
            FeelsLike = temp - 1.5m,
            TempMin = temp - 3m,
            TempMax = temp + 4m,
            Humidity = 78,
            Condition = condition,
            Description = description,
            Icon = icon,
            WindSpeed = 4.2m,
            RainProbability = rainProb,
            RecordedAt = now,
            DemandImpact = impact,
            IsSimulated = true,
        };
    }

    private async Task<WeatherForecastSummaryResponse> GenerateSimulatedForecastAsync(string city)
    {
        var current = await GetCurrentWeatherAsync(city);
        var now = DateTime.UtcNow;
        var forecastDays = new List<DailyWeatherForecastResponse>();

        var conditions = new[]
        {
            ("Rain", "moderate rain", 19.5m, 24.0m, 80m, "10d"),
            ("Thunderstorm", "thunderstorm with heavy rain", 18.0m, 22.0m, 90m, "11d"),
            ("Clouds", "overcast clouds", 20.0m, 25.5m, 35m, "04d"),
            ("Clear", "clear sky", 22.0m, 29.0m, 10m, "01d"),
            ("Clear", "warm and sunny", 23.0m, 30.5m, 5m, "01d"),
        };

        for (int i = 0; i < 5; i++)
        {
            var date = now.Date.AddDays(i + 1);
            var c = conditions[i % conditions.Length];
            var avgTemp = (c.Item3 + c.Item4) / 2m;
            var impact = ComputeDemandImpact(c.Item1, avgTemp);

            forecastDays.Add(new DailyWeatherForecastResponse
            {
                Date = date,
                DayOfWeek = date.DayOfWeek.ToString(),
                TempMin = c.Item3,
                TempMax = c.Item4,
                Condition = c.Item1,
                Description = c.Item2,
                Icon = c.Item6,
                RainProbability = c.Item5,
                ComfortFoodMultiplier = impact.ComfortFoodMultiplier,
                ColdBeverageMultiplier = impact.ColdBeverageMultiplier,
                SaladProduceMultiplier = impact.SaladProduceMultiplier,
                Recommendation = impact.RecommendationNote,
            });
        }

        return new WeatherForecastSummaryResponse
        {
            City = city,
            Current = current,
            Forecast = forecastDays,
            OverallRecommendation = current.DemandImpact.RecommendationNote,
            IsSimulated = true,
        };
    }

    // ── Demand Multipliers Logic ──────────────────────────────────────────

    private static WeatherDemandImpact ComputeDemandImpact(string condition, decimal temperature)
    {
        var condLower = condition.ToLowerInvariant();
        var isRainOrStorm = condLower.Contains("rain") ||
                            condLower.Contains("storm") ||
                            condLower.Contains("drizzle") ||
                            condLower.Contains("snow");

        if (isRainOrStorm || temperature < 16.0m)
        {
            return new WeatherDemandImpact
            {
                ComfortFoodMultiplier = 1.25m, // +25% warm meals, soups, curries, burgers
                ColdBeverageMultiplier = 0.85m, // -15% iced drinks
                SaladProduceMultiplier = 0.85m, // -15% patio salads
                RecommendationNote = "Rainy or cold weather predicted. Anticipate surge in comfort food, warm soups, and delivery packaging. Increase ingredient buffer for meat, broth, and pasta by 25%.",
            };
        }

        if (temperature > 27.0m || (temperature > 23.0m && condLower.Contains("clear")))
        {
            return new WeatherDemandImpact
            {
                ComfortFoodMultiplier = 0.85m, // -15% hot soups
                ColdBeverageMultiplier = 1.35m, // +35% cold drinks, ice, juices
                SaladProduceMultiplier = 1.25m, // +25% fresh greens, tomatoes, fruits
                RecommendationNote = "Warm sunny weather predicted. Anticipate elevated demand for cold drinks, outdoor patio dining, and fresh salads. Maintain higher buffer for fresh produce and beverages.",
            };
        }

        return new WeatherDemandImpact
        {
            ComfortFoodMultiplier = 1.0m,
            ColdBeverageMultiplier = 1.0m,
            SaladProduceMultiplier = 1.0m,
            RecommendationNote = "Moderate temperate weather forecast. Baseline inventory turnover and safety stocks apply.",
        };
    }
}
