import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/inventory_item_model.dart';
import '../providers/inventory_provider.dart';
import 'inventory_detail_screen.dart';

class InventoryListScreen extends StatefulWidget {
  const InventoryListScreen({super.key});

  @override
  State<InventoryListScreen> createState() => _InventoryListScreenState();
}

class _InventoryListScreenState extends State<InventoryListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InventoryProvider>().fetchInventory();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<InventoryProvider>();
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Inventory'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => provider.fetchInventory(),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Search & Filter Controls ───────────────────────
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              color: colorScheme.surface,
              child: Column(
                children: [
                  // Search Box
                  TextField(
                    controller: _searchController,
                    onChanged: (val) => provider.setSearchQuery(val),
                    decoration: InputDecoration(
                      hintText: 'Search ingredients or SKU...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                provider.clearSearch();
                              },
                            )
                          : null,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // KPI Row
                  Row(
                    children: [
                      _buildKpiCard(
                        context,
                        label: 'Total',
                        count: provider.totalCount,
                        color: colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      _buildKpiCard(
                        context,
                        label: 'Low Stock',
                        count: provider.lowStockCount,
                        color: Colors.orange,
                        icon: Icons.warning_amber_rounded,
                      ),
                      const SizedBox(width: 8),
                      _buildKpiCard(
                        context,
                        label: 'Out of Stock',
                        count: provider.outOfStockCount,
                        color: Colors.red,
                        icon: Icons.error_outline,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Filter Chips
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildFilterChip(context, label: 'All Items', filterKey: 'ALL'),
                        const SizedBox(width: 6),
                        _buildFilterChip(context, label: 'Low Stock', filterKey: 'LOW_STOCK'),
                        const SizedBox(width: 6),
                        _buildFilterChip(context, label: 'Out of Stock', filterKey: 'OUT_OF_STOCK'),
                        const SizedBox(width: 6),
                        _buildFilterChip(context, label: 'Optimal', filterKey: 'OPTIMAL'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),

            // ── Items List ─────────────────────────────────────
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => provider.fetchInventory(),
                child: _buildContent(context, provider),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, InventoryProvider provider) {
    if (provider.isLoading && provider.items.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (provider.errorMessage != null && provider.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off, size: 54, color: Colors.grey),
              const SizedBox(height: 12),
              Text(
                provider.errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => provider.fetchInventory(),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Try Again'),
              ),
            ],
          ),
        ),
      );
    }

    if (provider.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.search_off, size: 48, color: Colors.grey),
              const SizedBox(height: 10),
              Text(
                provider.searchQuery.isNotEmpty
                    ? 'No ingredients match "${provider.searchQuery}"'
                    : 'No inventory items found for selected filter.',
                style: const TextStyle(color: Colors.grey),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: provider.items.length,
      itemBuilder: (context, index) {
        final item = provider.items[index];
        return _buildInventoryCard(context, item);
      },
    );
  }

  Widget _buildKpiCard(
    BuildContext context, {
    required String label,
    required int count,
    required Color color,
    IconData? icon,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
            ],
            Text(
              '$label: ',
              style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w500),
            ),
            Text(
              '$count',
              style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(
    BuildContext context, {
    required String label,
    required String filterKey,
  }) {
    final provider = context.watch<InventoryProvider>();
    final isSelected = provider.selectedFilter == filterKey;
    final colorScheme = Theme.of(context).colorScheme;

    return FilterChip(
      selected: isSelected,
      label: Text(label, style: const TextStyle(fontSize: 11)),
      onSelected: (_) => provider.setFilter(filterKey),
      selectedColor: colorScheme.primaryContainer,
      checkmarkColor: colorScheme.onPrimaryContainer,
      visualDensity: VisualDensity.compact,
    );
  }

  Widget _buildInventoryCard(BuildContext context, InventoryItemModel item) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: item.isLowStock
              ? item.statusColor.withValues(alpha: 0.5)
              : colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => InventoryDetailScreen(item: item),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Row: Name & Status
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.ingredientName,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                        ),
                        if (item.sku.isNotEmpty)
                          Text(
                            'SKU: ${item.sku}',
                            style: TextStyle(fontSize: 11, color: theme.hintColor),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: item.statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: item.statusColor.withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      item.statusLabel,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: item.statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Stock level numbers
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  RichText(
                    text: TextSpan(
                      style: theme.textTheme.bodyMedium,
                      children: [
                        const TextSpan(text: 'Current: '),
                        TextSpan(
                          text: '${item.currentStock.toStringAsFixed(1)} ${item.unit}',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: item.statusColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    'Min: ${item.minimumStockLevel.toStringAsFixed(1)} ${item.unit}',
                    style: TextStyle(fontSize: 12, color: theme.hintColor),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // Visual Progress Bar
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: item.minimumStockLevel > 0
                      ? (item.currentStock / item.minimumStockLevel).clamp(0.0, 1.0)
                      : 1.0,
                  minHeight: 6,
                  backgroundColor: colorScheme.surfaceContainerHighest,
                  valueColor: AlwaysStoppedAnimation<Color>(item.statusColor),
                ),
              ),
              const SizedBox(height: 10),

              // Footer: Batches and Navigation hint
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.layers_outlined, size: 14, color: theme.hintColor),
                      const SizedBox(width: 4),
                      Text(
                        '${item.batches.length} active batch${item.batches.length == 1 ? "" : "es"}',
                        style: TextStyle(fontSize: 11, color: theme.hintColor),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Text(
                        'View Details',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: colorScheme.primary,
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 16, color: colorScheme.primary),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
