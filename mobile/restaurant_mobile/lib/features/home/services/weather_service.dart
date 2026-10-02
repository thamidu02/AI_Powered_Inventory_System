import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../models/weather_model.dart';

class WeatherService {
  final ApiService api;

  WeatherService({required this.api});

  Future<CurrentWeatherModel?> getCurrentWeather() async {
    try {
      final response = await api.get(ApiConstants.weatherCurrentEndpoint);
      if (response is Map<String, dynamic>) {
        return CurrentWeatherModel.fromJson(response);
      }
      return null;
    } catch (_) {
      // Graceful fallback if offline or backend weather unavailable
      return null;
    }
  }
}
