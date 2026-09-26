import 'package:flutter/material.dart';
import '../../../core/errors/api_exception.dart';
import '../models/inventory_item_model.dart';
import '../services/inventory_service.dart';

class InventoryProvider extends ChangeNotifier {
  final InventoryService inventoryService;

  List<InventoryItemModel> _items = [];
  bool _isLoading = false;
  String? _errorMessage;
  String _searchQuery = '';
  String _selectedFilter = 'ALL';

  InventoryProvider({required this.inventoryService});

  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;
  String get selectedFilter => _selectedFilter;

  int get totalCount => _items.length;
  int get lowStockCount => _items.where((i) => i.isLowStock && !i.isOutOfStock).length;
  int get outOfStockCount => _items.where((i) => i.isOutOfStock).length;
  int get optimalCount => _items.where((i) => !i.isLowStock && !i.isOutOfStock).length;

  List<InventoryItemModel> get items {
    return _items.where((item) {
      // 1. Search filter
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchName = item.ingredientName.toLowerCase().contains(q);
        final matchSku = item.sku.toLowerCase().contains(q);
        if (!matchName && !matchSku) return false;
      }

      // 2. Status filter
      switch (_selectedFilter) {
        case 'LOW_STOCK':
          return item.isLowStock && !item.isOutOfStock;
        case 'OUT_OF_STOCK':
          return item.isOutOfStock;
        case 'OPTIMAL':
          return !item.isLowStock && !item.isOutOfStock;
        case 'ALL':
        default:
          return true;
      }
    }).toList();
  }

  Future<void> fetchInventory() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _items = await inventoryService.getInventory();
      _isLoading = false;
      notifyListeners();
    } on ApiException catch (e) {
      _isLoading = false;
      _errorMessage = e.message;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = 'Failed to load inventory. Please check server connectivity.';
      notifyListeners();
    }
  }

  void setSearchQuery(String query) {
    _searchQuery = query.trim();
    notifyListeners();
  }

  void clearSearch() {
    _searchQuery = '';
    notifyListeners();
  }

  void setFilter(String filter) {
    _selectedFilter = filter;
    notifyListeners();
  }
}
