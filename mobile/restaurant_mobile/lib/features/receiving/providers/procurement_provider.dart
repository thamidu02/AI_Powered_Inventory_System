import 'package:flutter/foundation.dart';

import '../../../core/errors/api_exception.dart';
import '../models/purchase_order_model.dart';
import '../models/purchase_request_model.dart';
import '../services/procurement_service.dart';

class ProcurementProvider extends ChangeNotifier {
  final ProcurementService procurementService;

  List<PurchaseRequestModel> _requests = [];
  List<PurchaseOrderModel> _orders = [];
  bool _isLoading = false;
  bool _isProcessingAction = false;
  String? _errorMessage;

  ProcurementProvider({required this.procurementService});

  List<PurchaseRequestModel> get requests => _requests;
  List<PurchaseOrderModel> get orders => _orders;
  bool get isLoading => _isLoading;
  bool get isProcessingAction => _isProcessingAction;
  String? get errorMessage => _errorMessage;

  int get pendingPrCount => _requests.where((r) => r.isPending).length;
  int get pendingPoCount => _orders
      .where((o) => o.status == 'SUBMITTED' || o.status == 'PENDING_APPROVAL')
      .length;

  Future<void> fetchProcurementData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        procurementService.getPurchaseRequests(),
        procurementService.getPurchaseOrders(),
      ]);

      _requests = results[0] as List<PurchaseRequestModel>;
      _orders = results[1] as List<PurchaseOrderModel>;
      _isLoading = false;
      notifyListeners();
    } on ApiException catch (e) {
      _isLoading = false;
      _errorMessage = e.message;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = 'Failed to load procurement approvals.';
      notifyListeners();
    }
  }

  Future<bool> approveRequest(String id) async {
    _isProcessingAction = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await procurementService.approvePurchaseRequest(id);
      await fetchProcurementData();
      _isProcessingAction = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _isProcessingAction = false;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _isProcessingAction = false;
      _errorMessage = 'Failed to approve purchase request.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> rejectRequest(String id, {String? reason}) async {
    _isProcessingAction = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await procurementService.rejectPurchaseRequest(id, reason: reason);
      await fetchProcurementData();
      _isProcessingAction = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _isProcessingAction = false;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _isProcessingAction = false;
      _errorMessage = 'Failed to reject purchase request.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> approveOrder(String id) async {
    _isProcessingAction = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await procurementService.approvePurchaseOrder(id);
      await fetchProcurementData();
      _isProcessingAction = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _isProcessingAction = false;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _isProcessingAction = false;
      _errorMessage = 'Failed to approve purchase order.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> rejectOrder(String id, {String? reason}) async {
    _isProcessingAction = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await procurementService.rejectPurchaseOrder(id, reason: reason);
      await fetchProcurementData();
      _isProcessingAction = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _isProcessingAction = false;
      _errorMessage = e.message;
      notifyListeners();
      return false;
    } catch (_) {
      _isProcessingAction = false;
      _errorMessage = 'Failed to reject purchase order.';
      notifyListeners();
      return false;
    }
  }
}
