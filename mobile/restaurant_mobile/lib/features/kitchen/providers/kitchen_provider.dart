import 'package:flutter/material.dart';
import '../../../core/errors/api_exception.dart';
import '../models/menu_item_model.dart';
import '../models/recipe_model.dart';
import '../models/sale_model.dart';
import '../models/waste_model.dart';
import '../services/kitchen_service.dart';

class KitchenProvider extends ChangeNotifier {
  final KitchenService kitchenService;

  List<MenuItemModel> _menuItems = [];
  List<SaleModel> _sales = [];
  List<WasteRecordModel> _wasteRecords = [];
  final Map<String, int> _cart = {}; // menuItemId -> quantity
  final Map<String, RecipeModel> _cachedRecipes = {};

  bool _isLoading = false;
  bool _isSubmitting = false;
  String? _errorMessage;
  String _searchQuery = '';

  KitchenProvider({required this.kitchenService});

  // ── Getters ──────────────────────────────────────────────────────────────
  bool get isLoading => _isLoading;
  bool get isSubmitting => _isSubmitting;
  String? get errorMessage => _errorMessage;
  String get searchQuery => _searchQuery;

  List<MenuItemModel> get menuItems => _menuItems;
  List<SaleModel> get sales => _sales;
  List<WasteRecordModel> get wasteRecords => _wasteRecords;
  Map<String, int> get cart => _cart;

  int get cartItemCount => _cart.values.fold(0, (acc, qty) => acc + qty);

  double get cartTotal {
    double total = 0.0;
    for (final entry in _cart.entries) {
      final item = _menuItems.firstWhere(
        (m) => m.id == entry.key,
        orElse: () => MenuItemModel(id: entry.key, name: '', sellingPrice: 0.0),
      );
      total += item.sellingPrice * entry.value;
    }
    return total;
  }

  List<MenuItemModel> get filteredMenuItems {
    if (_searchQuery.isEmpty) return _menuItems;
    final q = _searchQuery.toLowerCase();
    return _menuItems.where((m) => m.name.toLowerCase().contains(q)).toList();
  }

  double get totalRevenue =>
      _sales.fold(0.0, (acc, s) => acc + s.totalAmount);

  int get totalWasteCount => _wasteRecords.length;

  // ── Cart Operations ──────────────────────────────────────────────────────
  int getQuantity(String menuItemId) => _cart[menuItemId] ?? 0;

  void addToCart(MenuItemModel item) {
    _cart[item.id] = (_cart[item.id] ?? 0) + 1;
    notifyListeners();
  }

  void incrementQuantity(String menuItemId) {
    _cart[menuItemId] = (_cart[menuItemId] ?? 0) + 1;
    notifyListeners();
  }

  void decrementQuantity(String menuItemId) {
    if (_cart.containsKey(menuItemId)) {
      if (_cart[menuItemId]! > 1) {
        _cart[menuItemId] = _cart[menuItemId]! - 1;
      } else {
        _cart.remove(menuItemId);
      }
      notifyListeners();
    }
  }

  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  void setSearchQuery(String query) {
    _searchQuery = query.trim();
    notifyListeners();
  }

  // ── Fetching Data ────────────────────────────────────────────────────────
  Future<void> fetchKitchenData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final results = await Future.wait([
        kitchenService.getMenuItems(),
        kitchenService.getSales(),
        kitchenService.getWasteRecords(),
      ]);

      _menuItems = results[0] as List<MenuItemModel>;
      _sales = results[1] as List<SaleModel>;
      _wasteRecords = results[2] as List<WasteRecordModel>;

      _isLoading = false;
      notifyListeners();
    } on ApiException catch (e) {
      _isLoading = false;
      _errorMessage = e.message;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _errorMessage = 'Failed to load kitchen operations data.';
      notifyListeners();
    }
  }

  Future<RecipeModel?> getRecipe(String menuItemId) async {
    if (_cachedRecipes.containsKey(menuItemId)) {
      return _cachedRecipes[menuItemId];
    }
    final recipe = await kitchenService.getMenuItemRecipe(menuItemId);
    if (recipe != null) {
      _cachedRecipes[menuItemId] = recipe;
    }
    return recipe;
  }

  // ── Sales & Consumption Submission ───────────────────────────────────────
  Future<SaleModel?> submitSale() async {
    if (_cart.isEmpty) return null;

    _isSubmitting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final items = _cart.entries
          .map((e) => CreateSaleItemRequest(menuItemId: e.key, quantity: e.value))
          .toList();

      final request = CreateSaleRequest(items: items);
      final sale = await kitchenService.createSale(request);

      clearCart();
      _sales.insert(0, sale);

      _isSubmitting = false;
      notifyListeners();
      return sale;
    } on ApiException catch (e) {
      _isSubmitting = false;
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _isSubmitting = false;
      _errorMessage = 'Sale submission failed: $e';
      notifyListeners();
      return null;
    }
  }

  // ── Waste Recording ──────────────────────────────────────────────────────
  Future<WasteRecordModel?> recordWaste(RecordWasteRequest request) async {
    _isSubmitting = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final record = await kitchenService.recordWaste(request);
      _wasteRecords.insert(0, record);

      _isSubmitting = false;
      notifyListeners();
      return record;
    } on ApiException catch (e) {
      _isSubmitting = false;
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (e) {
      _isSubmitting = false;
      _errorMessage = 'Waste recording failed: $e';
      notifyListeners();
      return null;
    }
  }

  // ── Waste Confirmation ───────────────────────────────────────────────────
  Future<bool> confirmWaste(String wasteRecordId) async {
    try {
      final updated = await kitchenService.confirmWaste(wasteRecordId);
      final index = _wasteRecords.indexWhere((w) => w.id == wasteRecordId);
      if (index != -1) {
        _wasteRecords[index] = updated;
        notifyListeners();
      }
      return true;
    } catch (_) {
      return false;
    }
  }
}
