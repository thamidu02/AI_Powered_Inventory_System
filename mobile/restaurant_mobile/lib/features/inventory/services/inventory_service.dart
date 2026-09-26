import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../models/inventory_item_model.dart';

class InventoryService {
  final ApiService api;

  InventoryService({required this.api});

  Future<List<InventoryItemModel>> getInventory() async {
    final response = await api.get(ApiConstants.inventoryEndpoint);
    if (response is! List<dynamic>) {
      throw Exception('Unexpected response format when fetching inventory.');
    }

    return response
        .map((item) => InventoryItemModel.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<InventoryItemModel?> getInventoryByIngredient(String ingredientId) async {
    final response = await api.get('${ApiConstants.inventoryEndpoint}/$ingredientId');
    if (response is! Map<String, dynamic>) {
      return null;
    }
    return InventoryItemModel.fromJson(response);
  }
}
