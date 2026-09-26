import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../../inventory/providers/inventory_provider.dart';
import '../models/menu_item_model.dart';
import '../providers/kitchen_provider.dart';
import 'record_waste_modal.dart';

class KitchenHubScreen extends StatefulWidget {
  const KitchenHubScreen({super.key});

  @override
  State<KitchenHubScreen> createState() => _KitchenHubScreenState();
}

class _KitchenHubScreenState extends State<KitchenHubScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<KitchenProvider>().fetchKitchenData();
      context.read<InventoryProvider>().fetchInventory();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _showRecipeDialog(BuildContext context, MenuItemModel item) async {
    final provider = context.read<KitchenProvider>();
    final recipe = await provider.getRecipe(item.id);

    if (!context.mounted) return;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.menu_book, color: Colors.deepOrange),
            const SizedBox(width: 8),
            Expanded(child: Text(item.name)),
          ],
        ),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Price: \$${item.sellingPrice.toStringAsFixed(2)}  •  Recipe v${recipe?.version ?? 1}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              const Text(
                'Ingredients Deducted on Preparation:',
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
              const SizedBox(height: 8),
              if (recipe == null || recipe.ingredients.isEmpty)
                const Text('No ingredients configured for this recipe.')
              else
                ...recipe.ingredients.map(
                  (ing) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('• ${ing.ingredientName}'),
                        Text(
                          '${ing.quantityRequired} ${ing.unit}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCheckout(BuildContext context) async {
    final provider = context.read<KitchenProvider>();
    final inventoryProvider = context.read<InventoryProvider>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Kitchen Prep & Consumption'),
        content: Text(
          'Record ${provider.cartItemCount} dishes for \$${provider.cartTotal.toStringAsFixed(2)}?\n\n'
          'Required recipe ingredients will be automatically deducted from inventory batches via FIFO.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Confirm & Deduct Stock'),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    final sale = await provider.submitSale();
    if (!context.mounted) return;

    if (sale != null) {
      inventoryProvider.fetchInventory(); // refresh stock levels immediately
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Order ${sale.shortId} recorded! Ingredients deducted via FIFO.'),
          backgroundColor: Colors.green.shade700,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.errorMessage ?? 'Failed to record kitchen preparation.'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  void _openRecordWasteModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const RecordWasteModal(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<KitchenProvider>();
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kitchen Operations'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => provider.fetchKitchenData(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.restaurant),
              text: 'Menu & POS (${provider.menuItems.length})',
            ),
            Tab(
              icon: const Icon(Icons.receipt_long),
              text: 'Sales (${provider.sales.length})',
            ),
            Tab(
              icon: const Icon(Icons.delete_outline),
              text: 'Waste (${provider.wasteRecords.length})',
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: TabBarView(
          controller: _tabController,
          children: [
            // ── Tab 1: Menu & POS Prep ───────────────────────────
            Column(
              children: [
                // Search bar
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  color: colorScheme.surface,
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => provider.setSearchQuery(val),
                    decoration: InputDecoration(
                      hintText: 'Search menu dishes...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),

                // Menu items grid / list
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => provider.fetchKitchenData(),
                    child: _buildMenuGrid(context, provider),
                  ),
                ),

                // Cart checkout bar
                if (provider.cartItemCount > 0)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: colorScheme.surface,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withAlpha(25),
                          blurRadius: 10,
                          offset: const Offset(0, -3),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${provider.cartItemCount} Dishes Selected',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            Text(
                              '\$${provider.cartTotal.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: colorScheme.primary,
                              ),
                            ),
                          ],
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: () => provider.clearCart(),
                          child: const Text('Clear'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton.icon(
                          onPressed: provider.isSubmitting ? null : () => _confirmCheckout(context),
                          icon: provider.isSubmitting
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.check),
                          label: const Text('Record Prep'),
                        ),
                      ],
                    ),
                  ),
              ],
            ),

            // ── Tab 2: Sales History ─────────────────────────────
            RefreshIndicator(
              onRefresh: () => provider.fetchKitchenData(),
              child: _buildSalesList(context, provider),
            ),

            // ── Tab 3: Food Waste Logging ────────────────────────
            RefreshIndicator(
              onRefresh: () => provider.fetchKitchenData(),
              child: _buildWasteList(context, provider),
            ),
          ],
        ),
      ),
      floatingActionButton: _tabController.index == 2
          ? FloatingActionButton.extended(
              onPressed: () => _openRecordWasteModal(context),
              icon: const Icon(Icons.add),
              label: const Text('Log Waste'),
            )
          : null,
    );
  }

  Widget _buildMenuGrid(BuildContext context, KitchenProvider provider) {
    if (provider.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final items = provider.filteredMenuItems;

    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.restaurant_menu, size: 56, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              const Text(
                'No menu items found',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        final qty = provider.getQuantity(item.id);
        final theme = Theme.of(context);

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.deepOrange.shade50,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.fastfood_outlined, color: Colors.deepOrange.shade700),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '\$${item.sellingPrice.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      if (item.description != null && item.description!.isNotEmpty)
                        Text(
                          item.description!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Inspect recipe ingredients',
                  icon: const Icon(Icons.info_outline, size: 20),
                  onPressed: () => _showRecipeDialog(context, item),
                ),
                if (qty == 0)
                  FilledButton.tonal(
                    onPressed: () => provider.addToCart(item),
                    child: const Text('Add'),
                  )
                else
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.remove_circle_outline, size: 22),
                        onPressed: () => provider.decrementQuantity(item.id),
                      ),
                      Text(
                        '$qty',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      IconButton(
                        icon: const Icon(Icons.add_circle_outline, size: 22),
                        onPressed: () => provider.incrementQuantity(item.id),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSalesList(BuildContext context, KitchenProvider provider) {
    if (provider.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final sales = provider.sales;

    if (sales.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.point_of_sale_outlined, size: 56, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              const Text(
                'No kitchen prep sales recorded yet',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                'Prepared dishes recorded in the Menu tab will appear here with FIFO ingredient deduction.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sales.length,
      itemBuilder: (context, index) {
        final sale = sales[index];
        final theme = Theme.of(context);

        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      sale.shortId,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                      ),
                    ),
                    Text(
                      '\$${sale.totalAmount.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ],
                ),
                Text(
                  'Prepped by ${sale.recordedByName}  •  ${sale.saleDate.toLocal().toString().split('.')[0]}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const Divider(height: 20),
                ...sale.items.map(
                  (item) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('${item.quantity}x ${item.menuItemName}'),
                        Text(
                          '\$${item.subtotal.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildWasteList(BuildContext context, KitchenProvider provider) {
    if (provider.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final records = provider.wasteRecords;
    final authProvider = context.watch<AuthProvider>();
    final isManager = (authProvider.user?.isRestaurantManager ?? false) ||
        (authProvider.user?.isInventoryManager ?? false);

    return Stack(
      children: [
        if (records.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.delete_outline, size: 56, color: Colors.grey.shade400),
                  const SizedBox(height: 12),
                  const Text(
                    'No food waste records logged',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Tap "Log Waste" below to record spoiled, expired, or damaged kitchen stock.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => _openRecordWasteModal(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Log Waste Now'),
                  ),
                ],
              ),
            ),
          )
        else
          ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
            itemCount: records.length,
            itemBuilder: (context, index) {
              final record = records[index];
              final theme = Theme.of(context);

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              record.ingredientName,
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: record.reasonBadgeColor.withAlpha(25),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              record.reason.replaceAll('_', ' '),
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: record.reasonBadgeColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Batch: ${record.stockBatchNumber}  •  Qty: ${record.quantity}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        'Reported by ${record.reportedByName} on ${record.recordedAt.toLocal().toString().split(' ')[0]}',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                      if (record.isConfirmed) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(Icons.verified, size: 14, color: Colors.green),
                            const SizedBox(width: 4),
                            Text(
                              'Confirmed by ${record.confirmedByName ?? "Manager"}',
                              style: const TextStyle(fontSize: 12, color: Colors.green),
                            ),
                          ],
                        ),
                      ] else if (isManager) ...[
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton.icon(
                            onPressed: () => provider.confirmWaste(record.id),
                            icon: const Icon(Icons.check, size: 16),
                            label: const Text('Confirm Waste'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        Positioned(
          bottom: 16,
          right: 16,
          child: FloatingActionButton.extended(
            onPressed: () => _openRecordWasteModal(context),
            icon: const Icon(Icons.add),
            label: const Text('Log Waste'),
          ),
        ),
      ],
    );
  }
}
