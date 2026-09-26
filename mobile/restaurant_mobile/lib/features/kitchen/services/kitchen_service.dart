import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../models/menu_item_model.dart';
import '../models/recipe_model.dart';
import '../models/sale_model.dart';
import '../models/waste_model.dart';

class KitchenService {
  final ApiService api;

  KitchenService({required this.api});

  /// Fetches available menu items for food preparation and sales
  Future<List<MenuItemModel>> getMenuItems() async {
    final response = await api.get('${ApiConstants.salesEndpoint}/menu-items');
    if (response is List) {
      return response
          .map((item) => MenuItemModel.fromJson(item as Map<String, dynamic>))
          .where((m) => m.isActive)
          .toList();
    }
    return [];
  }

  /// Fetches active recipe ingredients for a menu item
  Future<RecipeModel?> getMenuItemRecipe(String menuItemId) async {
    try {
      final response = await api.get('${ApiConstants.salesEndpoint}/menu-items/$menuItemId/recipe');
      return RecipeModel.fromJson(response as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  /// Fetches recorded sales and consumption records
  Future<List<SaleModel>> getSales() async {
    final response = await api.get(ApiConstants.salesEndpoint);
    if (response is List) {
      return response
          .map((item) => SaleModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Records food preparation sale and automatically deducts stock via FIFO
  Future<SaleModel> createSale(CreateSaleRequest request) async {
    final response = await api.post(
      ApiConstants.salesEndpoint,
      body: request.toJson(),
    );
    return SaleModel.fromJson(response as Map<String, dynamic>);
  }

  /// Fetches logged waste records
  Future<List<WasteRecordModel>> getWasteRecords() async {
    final response = await api.get(ApiConstants.wasteRecordsEndpoint);
    if (response is List) {
      return response
          .map((item) => WasteRecordModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Records damaged or expired ingredient stock waste
  Future<WasteRecordModel> recordWaste(RecordWasteRequest request) async {
    final response = await api.post(
      ApiConstants.wasteRecordsEndpoint,
      body: request.toJson(),
    );
    return WasteRecordModel.fromJson(response as Map<String, dynamic>);
  }

  /// Confirms a waste record (managerial approval)
  Future<WasteRecordModel> confirmWaste(String wasteRecordId) async {
    final response = await api.post(
      '${ApiConstants.wasteRecordsEndpoint}/$wasteRecordId/confirm',
    );
    return WasteRecordModel.fromJson(response as Map<String, dynamic>);
  }
}
