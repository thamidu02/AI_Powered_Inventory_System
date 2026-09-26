import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/storage_service.dart';
import '../models/user_model.dart';

class AuthService {
  final ApiService api;
  final StorageService storage;

  AuthService({
    required this.api,
    required this.storage,
  });

  Future<UserModel> login({
    required String email,
    required String password,
  }) async {
    final response = await api.post(
      ApiConstants.loginEndpoint,
      body: {
        'email': email.trim(),
        'password': password,
      },
      requiresAuth: false,
    );

    if (response is! Map<String, dynamic>) {
      throw Exception('Unexpected login response format from server.');
    }

    final user = UserModel.fromJson(response);

    // Persist JWT token and user profile locally
    await storage.saveToken(user.token);
    await storage.saveUserData(user.toJson());

    return user;
  }

  Future<void> logout() async {
    await storage.clearAuth();
  }

  UserModel? getCachedUser() {
    final data = storage.getUserData();
    if (data == null) return null;
    return UserModel.fromJson(data);
  }

  bool isAuthenticated() {
    return storage.hasToken();
  }
}
