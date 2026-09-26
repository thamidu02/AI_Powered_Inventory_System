import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../../inventory/providers/inventory_provider.dart';
import '../models/goods_receipt_model.dart';
import '../models/purchase_order_model.dart';
import '../models/storage_location_model.dart';
import '../providers/receiving_provider.dart';

class GoodsIntakeScreen extends StatefulWidget {
  final PurchaseOrderModel purchaseOrder;

  const GoodsIntakeScreen({super.key, required this.purchaseOrder});

  @override
  State<GoodsIntakeScreen> createState() => _GoodsIntakeScreenState();
}

class _ItemIntakeFormState {
  final PurchaseOrderItemModel orderItem;
  bool isIncluded;
  final TextEditingController quantityController;
  final TextEditingController batchController;
  StorageLocationModel? selectedLocation;
  DateTime? expiryDate;

  _ItemIntakeFormState({
    required this.orderItem,
    required this.isIncluded,
    required this.quantityController,
    required this.batchController,
    this.expiryDate,
  });

  void dispose() {
    quantityController.dispose();
    batchController.dispose();
  }
}

class _GoodsIntakeScreenState extends State<GoodsIntakeScreen> {
  final _notesController = TextEditingController();
  final List<_ItemIntakeFormState> _itemForms = [];
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _initializeFormItems();
  }

  void _initializeFormItems() {
    final now = DateTime.now();
    final dateStr =
        '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}';

    for (final item in widget.purchaseOrder.items) {
      final remaining = item.remainingQuantity;
      final isEligible = remaining > 0;
      final cleanIng = item.ingredientName
          .replaceAll(RegExp(r'[^a-zA-Z]'), '')
          .toUpperCase();
      final tag = cleanIng.length >= 3 ? cleanIng.substring(0, 3) : 'ING';
      final defaultBatch = 'B-$dateStr-$tag';

      _itemForms.add(
        _ItemIntakeFormState(
          orderItem: item,
          isIncluded: isEligible,
          quantityController: TextEditingController(
            text: isEligible ? remaining.toStringAsFixed(remaining.truncateToDouble() == remaining ? 0 : 2) : '0',
          ),
          batchController: TextEditingController(text: defaultBatch),
          expiryDate: now.add(const Duration(days: 30)),
        ),
      );
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      final locations = context.read<ReceivingProvider>().storageLocations;
      if (locations.isNotEmpty) {
        for (final form in _itemForms) {
          form.selectedLocation ??= locations.first;
        }
      }
      _initialized = true;
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    for (final form in _itemForms) {
      form.dispose();
    }
    super.dispose();
  }

  Future<void> _pickExpiryDate(_ItemIntakeFormState form) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: form.expiryDate ?? now.add(const Duration(days: 30)),
      firstDate: now.subtract(const Duration(days: 7)),
      lastDate: now.add(const Duration(days: 730)),
    );

    if (picked != null) {
      setState(() {
        form.expiryDate = picked;
      });
    }
  }

  void _generateNewBatch(_ItemIntakeFormState form) {
    final now = DateTime.now();
    final dateStr =
        '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}';
    final millis = (now.millisecondsSinceEpoch % 1000).toString().padLeft(3, '0');
    final cleanIng = form.orderItem.ingredientName
        .replaceAll(RegExp(r'[^a-zA-Z]'), '')
        .toUpperCase();
    final tag = cleanIng.length >= 3 ? cleanIng.substring(0, 3) : 'LOT';

    setState(() {
      form.batchController.text = 'B-$dateStr-$tag-$millis';
    });
  }

  Future<void> _submitIntake() async {
    final receivingProvider = context.read<ReceivingProvider>();
    final inventoryProvider = context.read<InventoryProvider>();

    final includedForms = _itemForms.where((f) => f.isIncluded).toList();
    if (includedForms.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select at least one item to receive.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // Validate quantities & locations
    final List<GoodsReceiptItemRequest> receiptItems = [];
    for (final form in includedForms) {
      final qty = double.tryParse(form.quantityController.text.trim()) ?? 0.0;
      if (qty <= 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Quantity for ${form.orderItem.ingredientName} must be greater than 0.'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      if (form.selectedLocation == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Please select a storage location for ${form.orderItem.ingredientName}.'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      receiptItems.add(
        GoodsReceiptItemRequest(
          purchaseOrderItemId: form.orderItem.id,
          storageLocationId: form.selectedLocation!.id,
          receivedQuantity: qty,
          unitCost: form.orderItem.unitPrice,
          batchNumber: form.batchController.text.trim().isNotEmpty
              ? form.batchController.text.trim()
              : null,
          expiryDate: form.expiryDate,
        ),
      );
    }

    // Confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Stock Intake'),
        content: Text(
          'Receive ${receiptItems.length} items for ${widget.purchaseOrder.supplierName}?\n'
          'Inventory stock and FIFO batches will be updated immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Confirm & Receive'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final request = CreateGoodsReceiptRequest(
      purchaseOrderId: widget.purchaseOrder.id,
      notes: _notesController.text.trim().isNotEmpty
          ? _notesController.text.trim()
          : null,
      items: receiptItems,
    );

    final result = await receivingProvider.submitIntake(request);

    if (mounted) {
      if (result != null) {
        // Trigger background inventory refresh
        inventoryProvider.fetchInventory();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Stock intake completed! ${result.items.length} batches recorded.'),
            backgroundColor: Colors.green.shade700,
          ),
        );
        Navigator.of(context).pop(true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(receivingProvider.errorMessage ?? 'Intake submission failed.'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final receivingProvider = context.watch<ReceivingProvider>();
    final authProvider = context.watch<AuthProvider>();
    final locations = receivingProvider.storageLocations;
    final isStaffOnly = authProvider.user?.isSalesKitchenStaff ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Receive Goods'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── PO Summary Card ──────────────────────────────
                  Card(
                    elevation: 0,
                    color: colorScheme.surfaceContainerHighest,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                                  color: colorScheme.primaryContainer,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(Icons.local_shipping, color: colorScheme.primary),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      widget.purchaseOrder.supplierName,
                                      style: theme.textTheme.titleMedium?.copyWith(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(
                                      '${widget.purchaseOrder.shortId}  •  ${widget.purchaseOrder.statusLabel}',
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: widget.purchaseOrder.statusColor,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 24),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Items in Order: ${widget.purchaseOrder.items.length}',
                                style: theme.textTheme.bodyMedium,
                              ),
                              Text(
                                'Total: \$${widget.purchaseOrder.totalAmount.toStringAsFixed(2)}',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── RBAC Warning for Kitchen Staff ───────────────
                  if (isStaffOnly)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        border: Border.all(color: Colors.amber.shade400),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.amber.shade800),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Notice: Staff role has read-only access. Intake submission requires Inventory Manager or Restaurant Manager credentials.',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.amber.shade900,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // ── Notes / Docket Input ─────────────────────────
                  TextField(
                    controller: _notesController,
                    decoration: InputDecoration(
                      labelText: 'Delivery Docket / Notes (Optional)',
                      hintText: 'e.g. Delivery note #9821, all boxes intact',
                      prefixIcon: const Icon(Icons.note_alt_outlined),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      filled: true,
                      fillColor: colorScheme.surface,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // ── Items Section Title ──────────────────────────
                  Text(
                    'Items to Receive',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),

                  // ── Item Intake Cards ────────────────────────────
                  ...List.generate(_itemForms.length, (index) {
                    final form = _itemForms[index];
                    final item = form.orderItem;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                        side: BorderSide(
                          color: form.isIncluded ? colorScheme.primary.withAlpha(80) : Colors.grey.shade300,
                          width: form.isIncluded ? 1.5 : 1,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Item Header & Checkbox
                            Row(
                              children: [
                                Checkbox(
                                  value: form.isIncluded,
                                  onChanged: (val) {
                                    setState(() {
                                      form.isIncluded = val ?? false;
                                    });
                                  },
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.ingredientName,
                                        style: theme.textTheme.titleSmall?.copyWith(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      Text(
                                        'Ordered: ${item.orderedQuantity} ${item.ingredientUnit}  •  Received: ${item.receivedQuantity} ${item.ingredientUnit}',
                                        style: theme.textTheme.bodySmall?.copyWith(
                                          color: Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (item.isFullyReceived)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.green.shade50,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      'FULFILLED',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.green.shade700,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.blue.shade50,
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      'Due: ${item.remainingQuantity} ${item.ingredientUnit}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.blue.shade800,
                                      ),
                                    ),
                                  ),
                              ],
                            ),

                            if (form.isIncluded) ...[
                              const Divider(height: 16),

                              // Quantity Input & Max button
                              Row(
                                children: [
                                  Expanded(
                                    flex: 3,
                                    child: TextFormField(
                                      controller: form.quantityController,
                                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                      decoration: InputDecoration(
                                        labelText: 'Receiving Qty (${item.ingredientUnit})',
                                        isDense: true,
                                        border: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  OutlinedButton(
                                    onPressed: () {
                                      setState(() {
                                        form.quantityController.text = item.remainingQuantity.toString();
                                      });
                                    },
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                    ),
                                    child: const Text('Max Rem.'),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),

                              // Storage Location Dropdown
                              DropdownButtonFormField<StorageLocationModel>(
                                initialValue: form.selectedLocation ?? (locations.isNotEmpty ? locations.first : null),
                                decoration: InputDecoration(
                                  labelText: 'Storage Location',
                                  isDense: true,
                                  prefixIcon: const Icon(Icons.warehouse_outlined, size: 20),
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                                items: locations.map((loc) {
                                  return DropdownMenuItem<StorageLocationModel>(
                                    value: loc,
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(loc.temperatureIcon, size: 16, color: loc.temperatureBadgeColor),
                                        const SizedBox(width: 6),
                                        Flexible(
                                          child: Text(
                                            loc.displayName,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                }).toList(),
                                onChanged: (val) {
                                  setState(() {
                                    form.selectedLocation = val;
                                  });
                                },
                              ),
                              const SizedBox(height: 10),

                              // Batch Number & Auto-generate
                              Row(
                                children: [
                                  Expanded(
                                    child: TextFormField(
                                      controller: form.batchController,
                                      decoration: InputDecoration(
                                        labelText: 'Batch Number',
                                        isDense: true,
                                        prefixIcon: const Icon(Icons.qr_code, size: 20),
                                        border: OutlineInputBorder(
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  IconButton(
                                    tooltip: 'Generate new batch code',
                                    icon: const Icon(Icons.refresh),
                                    onPressed: () => _generateNewBatch(form),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),

                              // Expiry Date Picker
                              InkWell(
                                onTap: () => _pickExpiryDate(form),
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey.shade400),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          Icon(Icons.event, size: 18, color: colorScheme.primary),
                                          const SizedBox(width: 8),
                                          Text(
                                            form.expiryDate != null
                                                ? 'Expiry: ${form.expiryDate!.toLocal().toString().split(' ')[0]}'
                                                : 'Set Expiry Date',
                                            style: TextStyle(
                                              color: form.expiryDate != null ? colorScheme.onSurface : Colors.grey,
                                              fontSize: 13,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const Icon(Icons.arrow_drop_down, color: Colors.grey),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),

            // ── Bottom Intake Action Bar ───────────────────────────
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colorScheme.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(20),
                    blurRadius: 8,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: (receivingProvider.isSubmitting || isStaffOnly)
                        ? null
                        : _submitIntake,
                    icon: receivingProvider.isSubmitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.check_circle_outline),
                    label: Text(
                      receivingProvider.isSubmitting
                          ? 'Recording Stock Intake...'
                          : 'Confirm Stock Intake (${_itemForms.where((f) => f.isIncluded).length} items)',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
