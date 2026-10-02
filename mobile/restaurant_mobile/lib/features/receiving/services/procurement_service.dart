import '../../../core/constants/api_constants.dart';
import '../../../core/services/api_service.dart';
import '../models/purchase_order_model.dart';
import '../models/purchase_request_model.dart';

class ProcurementService {
  final ApiService api;

  ProcurementService({required this.api});

  /// Fetches purchase requests with optional status filter (e.g. PENDING_APPROVAL)
  Future<List<PurchaseRequestModel>> getPurchaseRequests({
    String? status,
  }) async {
    String endpoint = ApiConstants.purchaseRequestsEndpoint;
    if (status != null && status.isNotEmpty) {
      endpoint += '?status=${Uri.encodeComponent(status)}';
    }

    final response = await api.get(endpoint);
    if (response is List) {
      return response
          .map(
            (item) =>
                PurchaseRequestModel.fromJson(item as Map<String, dynamic>),
          )
          .toList();
    }
    return [];
  }

  /// Manager approves a purchase request
  Future<PurchaseRequestModel> approvePurchaseRequest(String id) async {
    final response = await api.post(
      '${ApiConstants.purchaseRequestsEndpoint}/$id/approve',
    );
    return PurchaseRequestModel.fromJson(response as Map<String, dynamic>);
  }

  /// Manager rejects a purchase request with optional reason
  Future<PurchaseRequestModel> rejectPurchaseRequest(
    String id, {
    String? reason,
  }) async {
    final payload = reason != null && reason.isNotEmpty
        ? {'reason': reason}
        : null;
    final response = await api.post(
      '${ApiConstants.purchaseRequestsEndpoint}/$id/reject',
      body: payload,
    );
    return PurchaseRequestModel.fromJson(response as Map<String, dynamic>);
  }

  /// Fetches purchase orders with optional status filter (e.g. SUBMITTED)
  Future<List<PurchaseOrderModel>> getPurchaseOrders({String? status}) async {
    String endpoint = ApiConstants.purchaseOrdersEndpoint;
    if (status != null && status.isNotEmpty) {
      endpoint += '?status=${Uri.encodeComponent(status)}';
    }

    final response = await api.get(endpoint);
    if (response is List) {
      return response
          .map(
            (item) => PurchaseOrderModel.fromJson(item as Map<String, dynamic>),
          )
          .toList();
    }
    return [];
  }

  /// Manager approves a submitted purchase order
  Future<PurchaseOrderModel> approvePurchaseOrder(String id) async {
    final response = await api.post(
      '${ApiConstants.purchaseOrdersEndpoint}/$id/approve',
    );
    return PurchaseOrderModel.fromJson(response as Map<String, dynamic>);
  }

  /// Manager rejects a purchase order
  Future<PurchaseOrderModel> rejectPurchaseOrder(
    String id, {
    String? reason,
  }) async {
    final payload = reason != null && reason.isNotEmpty
        ? {'reason': reason}
        : null;
    final response = await api.post(
      '${ApiConstants.purchaseOrdersEndpoint}/$id/reject',
      body: payload,
    );
    return PurchaseOrderModel.fromJson(response as Map<String, dynamic>);
  }
}
