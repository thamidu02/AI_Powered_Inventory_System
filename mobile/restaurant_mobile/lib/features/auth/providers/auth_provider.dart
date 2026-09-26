import 'package:flutter/material.dart';
import '../../../core/errors/api_exception.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';

enum AuthStatus {
  initial,
  authenticating,
  authenticated,
  unauthenticated,
}

class AuthProvider extends ChangeNotifier {
  final AuthService authService;

  AuthStatus _status = AuthStatus.initial;
  UserModel? _currentUser;
  String? _errorMessage;

  AuthProvider({required this.authService}) {
    _restoreSession();
  }

  AuthStatus get status => _status;
  bool get isAuthenticated => _status == AuthStatus.authenticated && _currentUser != null;
  bool get isLoading => _status == AuthStatus.authenticating;
  UserModel? get user => _currentUser;
  String? get errorMessage => _errorMessage;

  void _restoreSession() {
    if (authService.isAuthenticated()) {
      _currentUser = authService.getCachedUser();
      if (_currentUser != null && !_currentUser!.isExpired) {
        _status = AuthStatus.authenticated;
      } else {
        authService.logout();
        _status = AuthStatus.unauthenticated;
      }
    } else {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      final user = await authService.login(email: email, password: password);
      _currentUser = user;
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'An unexpected error occurred during login. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await authService.logout();
    _currentUser = null;
    _status = AuthStatus.unauthenticated;
    _errorMessage = null;
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
