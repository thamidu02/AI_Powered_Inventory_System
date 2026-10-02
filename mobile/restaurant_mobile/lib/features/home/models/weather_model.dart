class WeatherDemandImpactModel {
  final double comfortFoodMultiplier;
  final double coldBeverageMultiplier;
  final double saladProduceMultiplier;
  final String recommendationNote;

  const WeatherDemandImpactModel({
    this.comfortFoodMultiplier = 1.0,
    this.coldBeverageMultiplier = 1.0,
    this.saladProduceMultiplier = 1.0,
    this.recommendationNote = '',
  });

  factory WeatherDemandImpactModel.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const WeatherDemandImpactModel();
    return WeatherDemandImpactModel(
      comfortFoodMultiplier:
          (json['comfortFoodMultiplier'] as num?)?.toDouble() ?? 1.0,
      coldBeverageMultiplier:
          (json['coldBeverageMultiplier'] as num?)?.toDouble() ?? 1.0,
      saladProduceMultiplier:
          (json['saladProduceMultiplier'] as num?)?.toDouble() ?? 1.0,
      recommendationNote: json['recommendationNote']?.toString() ?? '',
    );
  }
}

class CurrentWeatherModel {
  final String city;
  final String country;
  final double temperature;
  final double feelsLike;
  final int humidity;
  final String condition;
  final String description;
  final double rainProbability;
  final WeatherDemandImpactModel demandImpact;

  const CurrentWeatherModel({
    required this.city,
    required this.country,
    required this.temperature,
    required this.feelsLike,
    required this.humidity,
    required this.condition,
    required this.description,
    required this.rainProbability,
    required this.demandImpact,
  });

  factory CurrentWeatherModel.fromJson(Map<String, dynamic> json) {
    return CurrentWeatherModel(
      city: json['city']?.toString() ?? 'Kandy',
      country: json['country']?.toString() ?? 'LK',
      temperature: (json['temperature'] as num?)?.toDouble() ?? 24.0,
      feelsLike: (json['feelsLike'] as num?)?.toDouble() ?? 25.0,
      humidity: (json['humidity'] as num?)?.toInt() ?? 75,
      condition: json['condition']?.toString() ?? 'Clear',
      description: json['description']?.toString() ?? 'Clear sky',
      rainProbability: (json['rainProbability'] as num?)?.toDouble() ?? 0.0,
      demandImpact: WeatherDemandImpactModel.fromJson(
        json['demandImpact'] as Map<String, dynamic>?,
      ),
    );
  }
}
