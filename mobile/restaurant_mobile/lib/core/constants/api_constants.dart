import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode;

class ApiConstants {
  // Configurable host address:
  // Can be overridden at build or run time:
  // flutter build apk --dart-define=API_URL=https://restaurant-inventory-api-phi.vercel.app
  static const String _envBaseUrl = String.fromEnvironment('API_URL');

  // Deployed Cloud Backend (which in turn connects to the deployed AI Service)
  static const String cloudBackendUrl = 'https://restaurant-inventory-api-phi.vercel.app';

  static String get baseUrl {
    // 1. If an explicit API_URL was provided via --dart-define, prioritize it
    if (_envBaseUrl.isNotEmpty) {
      return _envBaseUrl;
    }

    // 2. In Release APK builds, default to the live cloud backend
    if (kReleaseMode) {
      return cloudBackendUrl;
    }

    // 3. In Debug mode on Android Emulator: 10.0.2.2 maps to host machine's localhost
    if (!kIsWeb && Platform.isAndroid) {
      return 'http://10.0.2.2:5066';
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
