namespace RestaurantInventory.API.DTOs.Weather;

public class WeatherDemandImpact
{
    public decimal ComfortFoodMultiplier { get; set; } = 1.0m;
    public decimal ColdBeverageMultiplier { get; set; } = 1.0m;
    public decimal SaladProduceMultiplier { get; set; } = 1.0m;
    public string RecommendationNote { get; set; } = string.Empty;
}

public class CurrentWeatherResponse
{
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public decimal Temperature { get; set; }
    public decimal FeelsLike { get; set; }
    public decimal TempMin { get; set; }
    public decimal TempMax { get; set; }
    public int Humidity { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public decimal WindSpeed { get; set; }
    public decimal RainProbability { get; set; }
    public DateTime RecordedAt { get; set; }
    public WeatherDemandImpact DemandImpact { get; set; } = new();
    public bool IsSimulated { get; set; }
}

public class DailyWeatherForecastResponse
{
    public DateTime Date { get; set; }
    public string DayOfWeek { get; set; } = string.Empty;
    public decimal TempMin { get; set; }
    public decimal TempMax { get; set; }
    public string Condition { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public decimal RainProbability { get; set; }
    public decimal ComfortFoodMultiplier { get; set; } = 1.0m;
    public decimal ColdBeverageMultiplier { get; set; } = 1.0m;
    public decimal SaladProduceMultiplier { get; set; } = 1.0m;
    public string Recommendation { get; set; } = string.Empty;
}

public class WeatherForecastSummaryResponse
{
    public string City { get; set; } = string.Empty;
    public CurrentWeatherResponse Current { get; set; } = new();
    public List<DailyWeatherForecastResponse> Forecast { get; set; } = new();
    public string OverallRecommendation { get; set; } = string.Empty;
    public bool IsSimulated { get; set; }
}
