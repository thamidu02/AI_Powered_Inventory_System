import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/services/api_service.dart';
import 'core/services/storage_service.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/auth/services/auth_service.dart';
import 'features/home/screens/home_dashboard_screen.dart';
import 'features/inventory/providers/inventory_provider.dart';
import 'features/inventory/services/inventory_service.dart';
import 'features/receiving/providers/receiving_provider.dart';
import 'features/receiving/services/receiving_service.dart';
import 'features/kitchen/providers/kitchen_provider.dart';
import 'features/kitchen/services/kitchen_service.dart';
import 'features/ai/providers/ai_provider.dart';
import 'features/ai/services/ai_service.dart';

import 'core/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storageService = await StorageService.initialize();
  final apiService = ApiService(storage: storageService);
  final authService = AuthService(api: apiService, storage: storageService);
  final inventoryService = InventoryService(api: apiService);
  final receivingService = ReceivingService(api: apiService);
  final kitchenService = KitchenService(api: apiService);
  final aiService = AiService(api: apiService);

  runApp(
    MultiProvider(
      providers: [
        Provider<StorageService>.value(value: storageService),
        Provider<ApiService>.value(value: apiService),
        Provider<AuthService>.value(value: authService),
        Provider<InventoryService>.value(value: inventoryService),
        Provider<ReceivingService>.value(value: receivingService),
        Provider<KitchenService>.value(value: kitchenService),
        Provider<AiService>.value(value: aiService),
        ChangeNotifierProvider<AuthProvider>(
          create: (_) => AuthProvider(authService: authService),
        ),
        ChangeNotifierProvider<InventoryProvider>(
          create: (_) => InventoryProvider(inventoryService: inventoryService),
        ),
        ChangeNotifierProvider<ReceivingProvider>(
          create: (_) => ReceivingProvider(receivingService: receivingService),
        ),
        ChangeNotifierProvider<KitchenProvider>(
          create: (_) => KitchenProvider(kitchenService: kitchenService),
        ),
        ChangeNotifierProvider<AiProvider>(
          create: (_) => AiProvider(aiService: aiService),
        ),
      ],
      child: const RestaurantInventoryApp(),
    ),
  );
}

class RestaurantInventoryApp extends StatelessWidget {
  const RestaurantInventoryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SavoryInventory Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      home: const AuthGateScreen(),
    );
  }
}

class AuthGateScreen extends StatelessWidget {
  const AuthGateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.isAuthenticated) {
      return const HomeDashboardScreen();
    }

    return const LoginScreen();
  }
}
