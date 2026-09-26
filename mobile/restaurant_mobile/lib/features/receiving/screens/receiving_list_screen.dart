import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/goods_receipt_model.dart';
import '../models/purchase_order_model.dart';
import '../providers/receiving_provider.dart';
import 'goods_intake_screen.dart';

class ReceivingListScreen extends StatefulWidget {
  const ReceivingListScreen({super.key});

  @override
  State<ReceivingListScreen> createState() => _ReceivingListScreenState();
}

class _ReceivingListScreenState extends State<ReceivingListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ReceivingProvider>().fetchReceivingData();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ReceivingProvider>();
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Goods Receiving'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () => provider.fetchReceivingData(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.local_shipping_outlined),
              text: 'Incoming Orders (${provider.readyToReceiveCount})',
            ),
            Tab(
              icon: const Icon(Icons.receipt_long_outlined),
              text: 'Recent Receipts (${provider.totalReceiptsCount})',
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: TabBarView(
          controller: _tabController,
          children: [
            // ── Tab 1: Incoming Orders ────────────────────────────
            RefreshIndicator(
              onRefresh: () => provider.fetchReceivingData(),
              child: Column(
                children: [
                  // KPI & Search Box
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    color: colorScheme.surface,
                    child: Column(
                      children: [
                        // Search bar
                        TextField(
                          controller: _searchController,
                          onChanged: (val) => provider.setSearchQuery(val),
                          decoration: InputDecoration(
                            hintText: 'Search supplier, PO number, or item...',
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
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                        const SizedBox(height: 10),

                        // Filter Chips Row
                        SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: [
                              _buildFilterChip('READY', 'Ready to Receive (${provider.readyToReceiveCount})', provider),
                              const SizedBox(width: 8),
                              _buildFilterChip('ALL', 'All Orders (${provider.totalOrdersCount})', provider),
                              const SizedBox(width: 8),
                              _buildFilterChip('COMPLETED', 'Completed (${provider.completedOrdersCount})', provider),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Order List / Loader / Empty State
                  Expanded(
                    child: _buildOrderList(context, provider),
                  ),
                ],
              ),
            ),

            // ── Tab 2: Recent Receipts ────────────────────────────
            RefreshIndicator(
              onRefresh: () => provider.fetchReceivingData(),
              child: _buildReceiptsList(context, provider),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String filterKey, String label, ReceivingProvider provider) {
    final isSelected = provider.selectedStatusFilter == filterKey;
    final theme = Theme.of(context);
    return FilterChip(
      selected: isSelected,
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 12,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        color: isSelected ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
      ),
      selectedColor: theme.colorScheme.primary,
      checkmarkColor: theme.colorScheme.onPrimary,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      onSelected: (_) => provider.setStatusFilter(filterKey),
    );
  }

  Widget _buildOrderList(BuildContext context, ReceivingProvider provider) {
    if (provider.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (provider.errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
              const SizedBox(height: 12),
              Text(
                provider.errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: () => provider.fetchReceivingData(),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final orders = provider.filteredOrders;

    if (orders.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.inventory_2_outlined, size: 56, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              Text(
                provider.selectedStatusFilter == 'READY'
                    ? 'No purchase orders pending delivery'
                    : 'No purchase orders found',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                'When purchase orders are approved and ordered, they appear here for stock intake verification.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: orders.length,
      itemBuilder: (context, index) {
        final order = orders[index];
        return _buildOrderCard(context, order);
      },
    );
  }

  Widget _buildOrderCard(BuildContext context, PurchaseOrderModel order) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isEligible = order.isEligibleForReceiving;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isEligible ? colorScheme.primary.withAlpha(60) : Colors.grey.shade200,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: isEligible
            ? () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => GoodsIntakeScreen(purchaseOrder: order),
                  ),
                );
              }
            : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top Row: Supplier & Status Chip
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.supplierName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          order.shortId,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade600,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: order.statusColor.withAlpha(25),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      order.statusLabel,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: order.statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Items summary & Total Amount
              Row(
                children: [
                  Icon(Icons.shopping_basket_outlined, size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 6),
                  Text(
                    '${order.items.length} items (${order.remainingItemsCount} pending)',
                    style: theme.textTheme.bodyMedium?.copyWith(color: Colors.grey.shade800),
                  ),
                  const Spacer(),
                  Text(
                    '\$${order.totalAmount.toStringAsFixed(2)}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colorScheme.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Expected Delivery Date / Delivery Status
              if (order.expectedDeliveryDate != null)
                Row(
                  children: [
                    Icon(Icons.calendar_today_outlined, size: 14, color: Colors.grey.shade600),
                    const SizedBox(width: 6),
                    Text(
                      'Expected: ${order.expectedDeliveryDate!.toLocal().toString().split(' ')[0]}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ),

              // Bottom Action button if eligible
              if (isEligible) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => GoodsIntakeScreen(purchaseOrder: order),
                        ),
                      );
                    },
                    icon: const Icon(Icons.input_rounded, size: 18),
                    label: const Text('Receive & Intake Goods'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReceiptsList(BuildContext context, ReceivingProvider provider) {
    if (provider.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final receipts = provider.goodsReceipts;

    if (receipts.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.receipt_outlined, size: 56, color: Colors.grey.shade400),
              const SizedBox(height: 12),
              const Text(
                'No past goods receipts recorded',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                'Completed stock intakes from incoming purchase orders will be logged here for audit verification.',
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
      itemCount: receipts.length,
      itemBuilder: (context, index) {
        final receipt = receipts[index];
        return _buildReceiptCard(context, receipt);
      },
    );
  }

  Widget _buildReceiptCard(BuildContext context, GoodsReceiptModel receipt) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(Icons.check_circle, size: 20, color: Colors.green.shade700),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        receipt.shortId,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                      Text(
                        'Received by ${receipt.receivedByName}',
                        style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                Text(
                  receipt.receiptDate.toLocal().toString().split(' ')[0],
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
            const Divider(height: 20),

            // Itemized intake batches preview
            Text(
              'Received Items (${receipt.items.length}):',
              style: theme.textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            ...receipt.items.map((item) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    const Icon(Icons.fiber_manual_record, size: 8, color: Colors.grey),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${item.ingredientName} (${item.batchNumber})',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    Text(
                      '+${item.receivedQuantity} ${item.ingredientUnit}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.green.shade800,
                      ),
                    ),
                  ],
                ),
              );
            }),

            if (receipt.notes != null && receipt.notes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.notes, size: 14, color: Colors.grey.shade600),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        receipt.notes!,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade700, fontStyle: FontStyle.italic),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
