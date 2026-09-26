import 'package:flutter/material.dart';
import '../../../core/errors/api_exception.dart';
import '../models/goods_receipt_model.dart';
import '../models/purchase_order_model.dart';
import '../models/storage_location_model.dart';
import '../services/receiving_service.dart';

class ReceivingProvider extends ChangeNotifier {
  final ReceivingService receivingService;

  List<PurchaseOrderModel> _purchaseOrders = [];
  List<StorageLocationModel> _storageLocations = [];
  List<GoodsReceiptModel> _goodsReceipts = [];

  bool _isLoading = false;
  bool _isSubmitting = false;
  String? _errorMessage;
  String _selectedStatusFilter = 'READY'; // 'READY', 'ALL', 'COMPLETED'
  String _searchQuery = '';

  ReceivingProvider({required this.receivingService});

  // ── Getters ──────────────────────────────────────────────────────────────
  bool get isLoading => _isLoading;
  bool get isSubmitting => _isSubmitting;
  String? get errorMessage => _errorMessage;
  String get selectedStatusFilter => _selectedStatusFilter;
  String get searchQuery => _searchQuery;

  List<StorageLocationModel> get storageLocations => _storageLocations;
  List<GoodsReceiptModel> get goodsReceipts => _goodsReceipts;

  int get totalOrdersCount => _purchaseOrders.length;
  int get readyToReceiveCount =>
      _purchaseOrders.where((po) => po.isEligibleForReceiving).length;
  int get completedOrdersCount =>
      _purchaseOrders.where((po) => po.isCompleted).length;
  int get totalReceiptsCount => _goodsReceipts.length;

  List<PurchaseOrderModel> get filteredOrders {
    return _purchaseOrders.where((order) {
      // 1. Status Filter
      if (_selectedStatusFilter == 'READY') {
        if (!order.isEligibleForReceiving) return false;
      } else if (_selectedStatusFilter == 'COMPLETED') {
        if (!order.isCompleted) return false;
      }

      // 2. Search Query
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchSupplier = order.supplierName.toLowerCase().contains(q);
        final matchId = order.id.toLowerCase().contains(q);
        final matchItem = order.items.any((i) => i.ingredientName.toLowerCase().contains(q));
        if (!matchSupplier && !matchId && !matchItem) return false;
      }

      return true;
    }).toList();
  }

  // ── Data Fetching ────────────────────────────────────────────────────────
  Future<void> fetchReceivingData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        receivingService.getPurchaseOrders(),
        receivingService.getStorageLocations(),
        receivingService.getGoodsReceipts(),
      ]);

      _purchaseOrders = results[0] as List<PurchaseOrderModel>;
      _storageLocations = results[1] as List<StorageLocationModel>;
      _goodsReceipts = results[2] as List<GoodsReceiptModel>;

      _isLoading = false;
      notifyListeners();
    } on ApiException catch (e) {
      _isLoading = false;
      _errorMessage = e.message;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = 'Failed to load receiving data. Please check connection.';
      notifyListeners();
    }
  }

  void setStatusFilter(String filter) {
    _selectedStatusFilter = filter;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query.trim();
    notifyListeners();
  }

  void clearSearch() {
    _searchQuery = '';
    notifyListeners();
  }

  // ── Intake Submission ───────────────────────────────────────────────────
  Future<GoodsReceiptModel?> submitIntake(CreateGoodsReceiptRequest request) async {
    _isSubmitting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final result = await receivingService.submitGoodsReceipt(request);

      // Refresh list to update PO status & recent receipts
      await fetchReceivingData();

      _isSubmitting = false;
      notifyListeners();
      return result;
    } on ApiException catch (e) {
      _isSubmitting = false;
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _isSubmitting = false;
      _errorMessage = 'Intake submission failed: $e';
      notifyListeners();
      return null;
    }
  }
}
