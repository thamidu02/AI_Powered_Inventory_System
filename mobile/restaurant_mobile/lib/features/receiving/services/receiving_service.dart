import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../models/goods_receipt_model.dart';
import '../models/purchase_order_model.dart';
import '../models/storage_location_model.dart';

class ReceivingService {
  final ApiService api;

  ReceivingService({required this.api});

  /// Fetches purchase orders, optionally filtered by status (e.g. ORDERED)
  Future<List<PurchaseOrderModel>> getPurchaseOrders({String? status}) async {
    String endpoint = ApiConstants.purchaseOrdersEndpoint;
    if (status != null && status.isNotEmpty) {
      endpoint += '?status=${Uri.encodeComponent(status)}';
    }

    final response = await api.get(endpoint);
    if (response is List) {
      return response
          .map((item) => PurchaseOrderModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Fetches single purchase order details
  Future<PurchaseOrderModel> getPurchaseOrderById(String id) async {
    final response = await api.get('${ApiConstants.purchaseOrdersEndpoint}/$id');
    return PurchaseOrderModel.fromJson(response as Map<String, dynamic>);
  }

  /// Fetches all active storage locations for intake assignment
  Future<List<StorageLocationModel>> getStorageLocations() async {
    final response = await api.get(ApiConstants.storageLocationsEndpoint);
    if (response is List) {
      return response
          .map((item) => StorageLocationModel.fromJson(item as Map<String, dynamic>))
          .where((loc) => loc.isActive)
          .toList();
    }
    return [];
  }

  /// Fetches past goods receipts history
  Future<List<GoodsReceiptModel>> getGoodsReceipts({String? purchaseOrderId}) async {
    String endpoint = ApiConstants.goodsReceiptsEndpoint;
    if (purchaseOrderId != null && purchaseOrderId.isNotEmpty) {
      endpoint += '?purchaseOrderId=${Uri.encodeComponent(purchaseOrderId)}';
    }

    final response = await api.get(endpoint);
    if (response is List) {
      return response
          .map((item) => GoodsReceiptModel.fromJson(item as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// Submits stock intake goods receipt
  Future<GoodsReceiptModel> submitGoodsReceipt(CreateGoodsReceiptRequest request) async {
    final response = await api.post(
      ApiConstants.goodsReceiptsEndpoint,
      body: request.toJson(),
    );
    return GoodsReceiptModel.fromJson(response as Map<String, dynamic>);
  }
}
