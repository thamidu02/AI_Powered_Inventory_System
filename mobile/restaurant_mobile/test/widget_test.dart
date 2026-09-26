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
import 'package:restaurant_mobile/features/inventory/models/inventory_item_model.dart';
import 'package:restaurant_mobile/features/inventory/providers/inventory_provider.dart';
import 'package:restaurant_mobile/features/inventory/screens/inventory_detail_screen.dart';
import 'package:restaurant_mobile/features/inventory/services/inventory_service.dart';
import 'package:restaurant_mobile/features/receiving/models/goods_receipt_model.dart';
import 'package:restaurant_mobile/features/receiving/models/purchase_order_model.dart';
import 'package:restaurant_mobile/features/receiving/models/storage_location_model.dart';
import 'package:restaurant_mobile/features/receiving/providers/receiving_provider.dart';
import 'package:restaurant_mobile/features/receiving/screens/goods_intake_screen.dart';
import 'package:restaurant_mobile/features/receiving/services/receiving_service.dart';
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

  group('InventoryItemModel Unit Tests', () {
    test('InventoryItemModel calculates deficit and status correctly', () {
      final item = InventoryItemModel(
        ingredientId: 'ing-1',
        ingredientName: 'Chicken Breast',
        sku: 'MEAT-CHK-01',
        unit: 'kg',
        currentStock: 4.5,
        minimumStockLevel: 10.0,
        maximumStockLevel: 25.0,
        isLowStock: true,
        batches: [
          StockBatchModel(
            id: 'b-1',
            batchNumber: 'BATCH-001',
            quantity: 4.5,
            unitCost: 8.50,
            receivedDate: DateTime.now().subtract(const Duration(days: 2)),
            expiryDate: DateTime.now().add(const Duration(days: 5)),
            status: 'AVAILABLE',
            storageLocationName: 'Cold Room 1',
          ),
        ],
      );

      expect(item.isLowStock, isTrue);
      expect(item.isOutOfStock, isFalse);
      expect(item.deficit, equals(5.5));
      expect(item.statusLabel, equals('LOW STOCK'));
      expect(item.batches.length, equals(1));
      expect(item.batches.first.isExpired, isFalse);
    });

    test('StockBatchModel detects expired and expiring batches', () {
      final expiredBatch = StockBatchModel(
        id: 'b-exp',
        batchNumber: 'BATCH-EXP',
        quantity: 2.0,
        unitCost: 5.0,
        receivedDate: DateTime.now().subtract(const Duration(days: 10)),
        expiryDate: DateTime.now().subtract(const Duration(days: 1)),
        status: 'EXPIRED',
        storageLocationName: 'Pantry',
      );

      expect(expiredBatch.isExpired, isTrue);
      expect(expiredBatch.isExpiringSoon, isFalse);

      final expiringSoonBatch = StockBatchModel(
        id: 'b-soon',
        batchNumber: 'BATCH-SOON',
        quantity: 5.0,
        unitCost: 5.0,
        receivedDate: DateTime.now().subtract(const Duration(days: 5)),
        expiryDate: DateTime.now().add(const Duration(days: 2)),
        status: 'AVAILABLE',
        storageLocationName: 'Pantry',
      );

      expect(expiringSoonBatch.isExpired, isFalse);
      expect(expiringSoonBatch.isExpiringSoon, isTrue);
    });
  });

  group('ApiConstants Tests', () {
    test('Endpoints are correctly configured', () {
      expect(ApiConstants.loginEndpoint, equals('/api/auth/login'));
      expect(ApiConstants.inventoryEndpoint, equals('/api/inventory'));
      expect(ApiConstants.ingredientsEndpoint, equals('/api/ingredients'));
      expect(ApiConstants.purchaseOrdersEndpoint, equals('/api/purchaseorders'));
      expect(ApiConstants.goodsReceiptsEndpoint, equals('/api/goodsreceipts'));
      expect(ApiConstants.aiChatEndpoint, equals('/api/ai/chat'));
    });
  });

  group('Step 2 & 3 UI and Widget Tests', () {
    testWidgets('LoginScreen renders brand, inputs, demo role chips, and sign-in button', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = await StorageService.initialize();
      final api = ApiService(storage: storage);
      final authService = AuthService(api: api, storage: storage);
      final inventoryService = InventoryService(api: api);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<StorageService>.value(value: storage),
            Provider<ApiService>.value(value: api),
            Provider<AuthService>.value(value: authService),
            Provider<InventoryService>.value(value: inventoryService),
            ChangeNotifierProvider<AuthProvider>(
              create: (_) => AuthProvider(authService: authService),
            ),
            ChangeNotifierProvider<InventoryProvider>(
              create: (_) => InventoryProvider(inventoryService: inventoryService),
            ),
          ],
          child: const RestaurantInventoryApp(),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('SavoryInventory'), findsOneWidget);
      expect(find.text('Kitchen Operations & Inventory Mobile'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(find.text('Sign In'), findsOneWidget);
      expect(find.text('Manager'), findsOneWidget);
    });

    testWidgets('HomeDashboardScreen renders authenticated user profile and operations cards', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({
        'auth_jwt_token': 'test-token',
        'auth_user_data': '{"userId":"1","email":"inventory@restaurant.com","fullName":"Sam Warehouse","role":"INVENTORY_MANAGER","token":"test-token","expiresAt":"2099-01-01T00:00:00.000Z"}',
      });

      final storage = await StorageService.initialize();
      final api = ApiService(storage: storage);
      final authService = AuthService(api: api, storage: storage);
      final inventoryService = InventoryService(api: api);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<StorageService>.value(value: storage),
            Provider<ApiService>.value(value: api),
            Provider<AuthService>.value(value: authService),
            Provider<InventoryService>.value(value: inventoryService),
            ChangeNotifierProvider<AuthProvider>(
              create: (_) => AuthProvider(authService: authService),
            ),
            ChangeNotifierProvider<InventoryProvider>(
              create: (_) => InventoryProvider(inventoryService: inventoryService),
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

    testWidgets('InventoryDetailScreen renders thresholds and batch breakdown', (WidgetTester tester) async {
      final sampleItem = InventoryItemModel(
        ingredientId: '1',
        ingredientName: 'Tomato Sauce',
        sku: 'ING-TOM-01',
        unit: 'liters',
        currentStock: 12.0,
        minimumStockLevel: 15.0,
        maximumStockLevel: 40.0,
        isLowStock: true,
        batches: [
          StockBatchModel(
            id: 'b-1',
            batchNumber: 'B-TOM-101',
            quantity: 12.0,
            unitCost: 2.50,
            receivedDate: DateTime.now().subtract(const Duration(days: 1)),
            expiryDate: DateTime.now().add(const Duration(days: 30)),
            status: 'AVAILABLE',
            storageLocationName: 'Dry Store A',
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp(
          home: InventoryDetailScreen(item: sampleItem),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Tomato Sauce'), findsNWidgets(2)); // AppBar + Header Card
      expect(find.text('SKU: ING-TOM-01  •  Unit: liters'), findsOneWidget);
      expect(find.text('LOW STOCK'), findsOneWidget);
      expect(find.text('B-TOM-101'), findsOneWidget);
      expect(find.text('Dry Store A'), findsOneWidget);
    });
  });

  group('Step 4 Receiving & Stock Intake Unit Tests', () {
    test('StorageLocationModel parses JSON and sets temperature badges', () {
      final json = {
        'id': 'loc-1',
        'name': 'Cold Room A',
        'description': 'Main walk-in dairy and meat cooler',
        'temperatureType': 'REFRIGERATED',
        'isActive': true,
      };

      final loc = StorageLocationModel.fromJson(json);
      expect(loc.id, equals('loc-1'));
      expect(loc.name, equals('Cold Room A'));
      expect(loc.temperatureType, equals('REFRIGERATED'));
      expect(loc.displayName, equals('Cold Room A (REFRIGERATED)'));
      expect(loc.isActive, isTrue);
    });

    test('PurchaseOrderModel computes remaining quantities and eligibility correctly', () {
      final json = {
        'id': '11112222-3333-4444-5555-666677778888',
        'supplierId': 'sup-1',
        'supplierName': 'Fresh Farms Organic',
        'status': 'ORDERED',
        'totalAmount': 450.00,
        'items': [
          {
            'id': 'poi-1',
            'purchaseOrderId': '11112222-3333-4444-5555-666677778888',
            'ingredientId': 'ing-1',
            'ingredientName': 'Fresh Milk',
            'ingredientUnit': 'liters',
            'orderedQuantity': 50.0,
            'unitPrice': 3.50,
            'receivedQuantity': 20.0,
          },
          {
            'id': 'poi-2',
            'purchaseOrderId': '11112222-3333-4444-5555-666677778888',
            'ingredientId': 'ing-2',
            'ingredientName': 'Butter',
            'ingredientUnit': 'kg',
            'orderedQuantity': 10.0,
            'unitPrice': 6.00,
            'receivedQuantity': 10.0,
          },
        ],
      };

      final po = PurchaseOrderModel.fromJson(json);
      expect(po.shortId, equals('PO-11112222'));
      expect(po.isEligibleForReceiving, isTrue);
      expect(po.statusLabel, equals('READY TO RECEIVE'));
      expect(po.items.length, equals(2));

      // Item 1 (partial)
      expect(po.items[0].remainingQuantity, equals(30.0));
      expect(po.items[0].isFullyReceived, isFalse);

      // Item 2 (fully received)
      expect(po.items[1].remainingQuantity, equals(0.0));
      expect(po.items[1].isFullyReceived, isTrue);

      expect(po.remainingItemsCount, equals(1));
    });

    test('CreateGoodsReceiptRequest formats correct JSON payload', () {
      final req = CreateGoodsReceiptRequest(
        purchaseOrderId: 'po-1',
        notes: 'Delivery docket #1092',
        items: [
          const GoodsReceiptItemRequest(
            purchaseOrderItemId: 'poi-1',
            storageLocationId: 'loc-1',
            receivedQuantity: 30.0,
            unitCost: 3.50,
            batchNumber: 'B-2026-MILK',
          ),
        ],
      );

      final json = req.toJson();
      expect(json['purchaseOrderId'], equals('po-1'));
      expect(json['notes'], equals('Delivery docket #1092'));
      final items = json['items'] as List;
      expect(items.length, equals(1));
      expect(items[0]['receivedQuantity'], equals(30.0));
      expect(items[0]['batchNumber'], equals('B-2026-MILK'));
    });
  });

  group('Step 4 Widget Tests', () {
    testWidgets('GoodsIntakeScreen renders PO supplier, item fields, and confirm button', (WidgetTester tester) async {
      SharedPreferences.setMockInitialValues({});
      final storage = await StorageService.initialize();
      final api = ApiService(storage: storage);
      final authService = AuthService(api: api, storage: storage);
      final receivingService = ReceivingService(api: api);
      final inventoryService = InventoryService(api: api);

      final samplePo = PurchaseOrderModel(
        id: 'po-test-99',
        supplierId: 'sup-1',
        supplierName: 'Highland Dairy Co',
        status: 'ORDERED',
        totalAmount: 180.0,
        items: [
          const PurchaseOrderItemModel(
            id: 'poi-test-1',
            purchaseOrderId: 'po-test-99',
            ingredientId: 'ing-1',
            ingredientName: 'Whole Milk',
            ingredientUnit: 'liters',
            orderedQuantity: 40.0,
            unitPrice: 4.50,
            receivedQuantity: 0.0,
          ),
        ],
      );

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            Provider<StorageService>.value(value: storage),
            Provider<ApiService>.value(value: api),
            Provider<AuthService>.value(value: authService),
            Provider<ReceivingService>.value(value: receivingService),
            Provider<InventoryService>.value(value: inventoryService),
            ChangeNotifierProvider<AuthProvider>(
              create: (_) => AuthProvider(authService: authService),
            ),
            ChangeNotifierProvider<InventoryProvider>(
              create: (_) => InventoryProvider(inventoryService: inventoryService),
            ),
            ChangeNotifierProvider<ReceivingProvider>(
              create: (_) => ReceivingProvider(receivingService: receivingService),
            ),
          ],
          child: MaterialApp(
            home: GoodsIntakeScreen(purchaseOrder: samplePo),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Receive Goods'), findsOneWidget);
      expect(find.text('Highland Dairy Co'), findsOneWidget);
      expect(find.text('Whole Milk'), findsOneWidget);
      expect(find.text('Due: 40.0 liters'), findsOneWidget);
      expect(find.text('Confirm Stock Intake (1 items)'), findsOneWidget);
    });
  });
}
