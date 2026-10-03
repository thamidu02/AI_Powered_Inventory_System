import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class ApiConstants {
  // Configurable host address:
  // - Android Emulator: 10.0.2.2 points to host machine localhost
  // - iOS Simulator / Desktop / Web: localhost points to host machine
  static String get baseUrl {
    if (!kIsWeb && Platform.isAndroid) {
      return 'http://10.0.2.2:5066';
    }
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
