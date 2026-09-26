import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:restaurant_mobile/core/constants/api_constants.dart';
import 'package:restaurant_mobile/features/auth/models/user_model.dart';
import 'package:restaurant_mobile/features/auth/providers/auth_provider.dart';
import 'package:restaurant_mobile/features/auth/services/auth_service.dart';
import 'package:restaurant_mobile/core/services/api_service.dart';
import 'package:restaurant_mobile/core/services/storage_service.dart';
import 'package:restaurant_mobile/features/home/screens/home_dashboard_screen.dart';
import 'package:restaurant_mobile/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('UserModel Unit Tests', () {
    test('UserModel.fromJson parses .NET LoginResponse correctly', () {
      final json = {
        'userId': '11111111-2222-3333-4444-555555555555',
        'email': 'manager@restaurant.com',
        'fullName': 'Alice Manager',
        'role': 'RESTAURANT_MANAGER',
        'token': 'mock-jwt-token-xyz',
        'expiresAt': DateTime.now().add(const Duration(hours: 8)).toIso8601String(),
      };

      final user = UserModel.fromJson(json);

      expect(user.id, equals('11111111-2222-3333-4444-555555555555'));
      expect(user.email, equals('manager@restaurant.com'));
      expect(user.fullName, equals('Alice Manager'));
      expect(user.role, equals('RESTAURANT_MANAGER'));
      expect(user.isRestaurantManager, isTrue);
      expect(user.isExpired, isFalse);
    });

    test('UserModel role getters identify staff roles', () {
      final kitchenUser = UserModel(
        id: '2',
        email: 'cook@restaurant.com',
        fullName: 'Bob Cook',
        role: 'SALES_KITCHEN_STAFF',
        token: 'token',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
      );

      expect(kitchenUser.isSalesKitchenStaff, isTrue);
      expect(kitchenUser.isRestaurantManager, isFalse);
    });
  });

  group('ApiConstants Tests', () {
    test('Endpoints are correctly configured', () {
      expect(ApiConstants.loginEndpoint, equals('/api/auth/login'));
      expect(ApiConstants.inventoryEndpoint, equals('/api/inventory'));
      expect(ApiConstants.ingredientsEndpoint, equals('/api/ingredients'));
      expect(ApiConstants.aiChatEndpoint, equals('/api/ai/chat'));
    });
  });

  group('Step 2 UI and Widget Tests', () {
    testWidgets('LoginScreen renders brand, inputs, demo role chips, and sign-in button', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = await StorageService.initialize();
      final api = ApiService(storage: storage);
      final authService = AuthService(api: api, storage: storage);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<StorageService>.value(value: storage),
            Provider<ApiService>.value(value: api),
            Provider<AuthService>.value(value: authService),
            ChangeNotifierProvider<AuthProvider>(
              create: (_) => AuthProvider(authService: authService),
            ),
          ],
          child: const RestaurantInventoryApp(),
        ),
      );

      await tester.pumpAndSettle();

      // Brand Title
      expect(find.text('SavoryInventory'), findsOneWidget);
      expect(find.text('Kitchen Operations & Inventory Mobile'), findsOneWidget);

      // Input Form Fields
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('Email Address'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);

      // Sign In Button
      expect(find.text('Sign In'), findsOneWidget);

      // Demo Role Action Chips
      expect(find.text('Manager'), findsOneWidget);
      expect(find.text('Inventory'), findsOneWidget);
      expect(find.text('Kitchen'), findsOneWidget);

      // Tap on Manager demo chip
      await tester.tap(find.text('Manager'));
      await tester.pumpAndSettle();

      // Verifies fields populated
      expect(find.text('manager@restaurant.com'), findsOneWidget);
    });

    testWidgets('HomeDashboardScreen renders authenticated user profile and operations cards', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({
        'auth_jwt_token': 'test-token',
        'auth_user_data': '{"userId":"1","email":"inventory@restaurant.com","fullName":"Sam Warehouse","role":"INVENTORY_MANAGER","token":"test-token","expiresAt":"2099-01-01T00:00:00.000Z"}',
      });

      final storage = await StorageService.initialize();
      final api = ApiService(storage: storage);
      final authService = AuthService(api: api, storage: storage);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<StorageService>.value(value: storage),
            Provider<ApiService>.value(value: api),
            Provider<AuthService>.value(value: authService),
            ChangeNotifierProvider<AuthProvider>(
              create: (_) => AuthProvider(authService: authService),
            ),
          ],
          child: const MaterialApp(
            home: HomeDashboardScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('KitchenOps Mobile'), findsOneWidget);
      expect(find.text('Sam Warehouse'), findsOneWidget);
      expect(find.text('INVENTORY MANAGER'), findsOneWidget);
      expect(find.text('Stock & Inventory'), findsOneWidget);
      expect(find.text('Goods Receiving'), findsOneWidget);
      expect(find.text('AI Assistant'), findsOneWidget);
    });
  });
}
