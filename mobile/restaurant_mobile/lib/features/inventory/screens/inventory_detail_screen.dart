import 'package:flutter/material.dart';
import '../models/inventory_item_model.dart';

class InventoryDetailScreen extends StatelessWidget {
  final InventoryItemModel item;

  const InventoryDetailScreen({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(item.ingredientName),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          // ── Header Card ──────────────────────────────────────
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: colorScheme.outlineVariant.withValues(alpha: 0.5)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(18.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          item.ingredientName,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: item.statusColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: item.statusColor.withValues(alpha: 0.5)),
                        ),
                        child: Text(
                          item.statusLabel,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: item.statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'SKU: ${item.sku.isNotEmpty ? item.sku : "N/A"}  •  Unit: ${item.unit}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.hintColor,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Stock Progress Bar
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: item.minimumStockLevel > 0
                          ? (item.currentStock / item.minimumStockLevel).clamp(0.0, 1.0)
                          : 1.0,
                      minHeight: 8,
                      backgroundColor: colorScheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation<Color>(item.statusColor),
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Metrics Grid
                  Row(
                    children: [
                      _buildMetricTile(
                        context,
                        label: 'Current Stock',
                        value: '${item.currentStock.toStringAsFixed(1)} ${item.unit}',
                        color: item.statusColor,
                      ),
                      const SizedBox(width: 8),
                      _buildMetricTile(
                        context,
                        label: 'Min Level',
                        value: '${item.minimumStockLevel.toStringAsFixed(1)} ${item.unit}',
                      ),
                      const SizedBox(width: 8),
                      _buildMetricTile(
                        context,
                        label: 'Max Level',
                        value: item.maximumStockLevel > 0
                            ? '${item.maximumStockLevel.toStringAsFixed(1)} ${item.unit}'
                            : 'No limit',
                      ),
                    ],
                  ),

                  // Deficit Callout if Low
                  if (item.isLowStock && item.deficit > 0) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.info_outline, size: 18, color: Colors.amber),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Reorder deficit: ${item.deficit.toStringAsFixed(1)} ${item.unit} needed to reach minimum threshold.',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),

          // ── Batches Section ──────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Active Batches (${item.batches.length})',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'FIFO Order',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.hintColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          if (item.batches.isEmpty)
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: colorScheme.outlineVariant.withValues(alpha: 0.3)),
              ),
              child: const Padding(
                padding: EdgeInsets.all(32.0),
                child: Center(
                  child: Column(
                    children: [
                      Icon(Icons.inventory_2_outlined, size: 40, color: Colors.grey),
                      SizedBox(height: 8),
                      Text(
                        'No active stock batches currently on hand.',
                        style: TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            ...item.batches.map((batch) => _buildBatchCard(context, batch)),
        ],
      ),
    );
  }

  Widget _buildMetricTile(
    BuildContext context, {
    required String label,
    required String value,
    Color? color,
  }) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: color ?? colorScheme.onSurface,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBatchCard(BuildContext context, StockBatchModel batch) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    Color expiryBadgeColor = Colors.green;
    String expiryText = 'Valid';
    if (batch.isExpired) {
      expiryBadgeColor = Colors.red;
      expiryText = 'EXPIRED';
    } else if (batch.isExpiringSoon) {
      expiryBadgeColor = Colors.orange;
      expiryText = 'EXPIRING SOON';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: batch.isExpired
              ? Colors.red.withValues(alpha: 0.4)
              : colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Batch number and Status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.qr_code, size: 18),
                    const SizedBox(width: 6),
                    Text(
                      batch.batchNumber,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    batch.status,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 18),

            // Quantity and Location
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Batch Quantity', style: theme.textTheme.bodySmall),
                    Text(
                      '${batch.quantity.toStringAsFixed(1)} ${item.unit}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Storage Location', style: theme.textTheme.bodySmall),
                    Row(
                      children: [
                        const Icon(Icons.place_outlined, size: 14, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text(
                          batch.storageLocationName,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Expiry info
            if (batch.expiryDate != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: expiryBadgeColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      batch.isExpired ? Icons.error_outline : Icons.schedule,
                      size: 14,
                      color: expiryBadgeColor,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Expires: ${batch.expiryDate!.toLocal().toString().split(" ")[0]} ($expiryText)',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: expiryBadgeColor,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
