import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode;

class ApiConstants {
  // Can be overridden at build time:
  // flutter build apk --dart-define=API_URL=http://...
  static const String _envBaseUrl = String.fromEnvironment('API_URL');

  // Deployed Cloud Backend
  static const String cloudBackendUrl = 'https://restaurant-inventory-api-phi.vercel.app';

  // Your PC's Wi-Fi IP for direct connection from mobile devices on the same network
  static const String localWifiUrl = 'http://172.19.83.111:5066';

  // Android Emulator loopback
  static const String emulatorUrl = 'http://10.0.2.2:5066';

  // In-app dynamically selected base URL (saved in SharedPreferences)
  static String? customBaseUrl;

  static String get baseUrl {
    // In Release builds, ALWAYS use the Vercel cloud backend.
    // No saved URL, env var, or custom override can change this for production.
    if (kReleaseMode) {
      return cloudBackendUrl;
    }

    // --- Debug / Development builds only below ---

    // 1. If user configured in-app or loaded from storage (debug only)
    if (customBaseUrl != null && customBaseUrl!.trim().isNotEmpty) {
      return customBaseUrl!.trim();
    }

    // 2. If provided via --dart-define=API_URL=... (debug only)
    if (_envBaseUrl.isNotEmpty) {
      return _envBaseUrl;
    }

    // 3. In Debug mode on Android Emulator: 10.0.2.2 maps to host machine's localhost
    if (!kIsWeb && Platform.isAndroid) {
      return emulatorUrl;
    }

    // 4. Default for local web, desktop, and iOS simulator
    return 'http://localhost:5066';
  }

  // Auth endpoints
  static const String loginEndpoint = '/api/auth/login';

  // Inventory & Ingredients endpoints
  static const String inventoryEndpoint = '/api/inventory';
  static const String inventoryAdjustEndpoint = '/api/inventory/adjust';
  static const String ingredientsEndpoint = '/api/ingredients';
  static const String storageLocationsEndpoint = '/api/storagelocations';

  // Operations & Procurement endpoints
  static const String purchaseRequestsEndpoint = '/api/purchaserequests';
  static const String purchaseOrdersEndpoint = '/api/purchaseorders';
  static const String goodsReceiptsEndpoint = '/api/goodsreceipts';
  static const String salesEndpoint = '/api/sales';
  static const String wasteRecordsEndpoint = '/api/wasterecords';

  // AI & Weather intelligence endpoints
  static const String aiChatEndpoint = '/api/ai/chat';
  static const String weatherEndpoint = '/api/weather';
  static const String weatherCurrentEndpoint = '/api/weather/current';
}
