import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../inventory/models/inventory_item_model.dart';
import '../../inventory/providers/inventory_provider.dart';
import '../models/waste_model.dart';
import '../providers/kitchen_provider.dart';

class RecordWasteModal extends StatefulWidget {
  const RecordWasteModal({super.key});

  @override
  State<RecordWasteModal> createState() => _RecordWasteModalState();
}

class _RecordWasteModalState extends State<RecordWasteModal> {
  final _quantityController = TextEditingController();
  InventoryItemModel? _selectedItem;
  StockBatchModel? _selectedBatch;
  String _selectedReason = 'EXPIRED';

  final List<String> _reasons = [
    'EXPIRED',
    'SPOILED',
    'DAMAGED',
    'PREPARATION_DEFECT',
    'CONTAMINATED',
    'OTHER',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final inventoryItems = context.read<InventoryProvider>().items;
      if (inventoryItems.isNotEmpty) {
        setState(() {
          _selectedItem = inventoryItems.firstWhere(
            (i) => i.batches.isNotEmpty,
            orElse: () => inventoryItems.first,
          );
          if (_selectedItem != null && _selectedItem!.batches.isNotEmpty) {
            _selectedBatch = _selectedItem!.batches.first;
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _submitWaste() async {
    if (_selectedBatch == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select an ingredient batch to discard.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final qty = double.tryParse(_quantityController.text.trim()) ?? 0.0;
    if (qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Waste quantity must be greater than 0.'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final kitchenProvider = context.read<KitchenProvider>();
    final inventoryProvider = context.read<InventoryProvider>();

    final request = RecordWasteRequest(
      stockBatchId: _selectedBatch!.id,
      quantity: qty,
      reason: _selectedReason,
    );

    final result = await kitchenProvider.recordWaste(request);

    if (mounted) {
      if (result != null) {
        inventoryProvider.fetchInventory(); // refresh stock levels
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Logged waste: ${result.quantity} ${_selectedItem?.unit ?? "units"} for ${result.ingredientName} (${result.reason}).',
            ),
            backgroundColor: Colors.green.shade700,
          ),
        );
        Navigator.of(context).pop(true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(kitchenProvider.errorMessage ?? 'Failed to log waste.'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inventoryProvider = context.watch<InventoryProvider>();
    final kitchenProvider = context.watch<KitchenProvider>();
    final itemsWithBatches = inventoryProvider.items;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.delete_sweep_outlined, color: Colors.red.shade700),
                ),
                const SizedBox(width: 12),
                Text(
                  'Log Kitchen Food Waste',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Select Ingredient Dropdown
            DropdownButtonFormField<InventoryItemModel>(
              initialValue: _selectedItem,
              decoration: InputDecoration(
                labelText: 'Select Ingredient',
                prefixIcon: const Icon(Icons.inventory_2_outlined, size: 20),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              items: itemsWithBatches.map((item) {
                return DropdownMenuItem<InventoryItemModel>(
                  value: item,
                  child: Text(
                    '${item.ingredientName} (${item.currentStock} ${item.unit})',
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }).toList(),
              onChanged: (item) {
                setState(() {
                  _selectedItem = item;
                  if (item != null && item.batches.isNotEmpty) {
                    _selectedBatch = item.batches.first;
                  } else {
                    _selectedBatch = null;
                  }
                });
              },
            ),
            const SizedBox(height: 14),

            // Select Stock Batch Dropdown
            if (_selectedItem != null && _selectedItem!.batches.isNotEmpty)
              DropdownButtonFormField<StockBatchModel>(
                initialValue: _selectedBatch,
                decoration: InputDecoration(
                  labelText: 'Stock Batch',
                  prefixIcon: const Icon(Icons.qr_code, size: 20),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
                items: _selectedItem!.batches.map((batch) {
                  return DropdownMenuItem<StockBatchModel>(
                    value: batch,
                    child: Text(
                      '${batch.batchNumber}  •  ${batch.quantity} ${_selectedItem!.unit} avail.',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  );
                }).toList(),
                onChanged: (batch) {
                  setState(() {
                    _selectedBatch = batch;
                  });
                },
              )
            else
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber, size: 20, color: Colors.amber),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'No active stock batches found for this ingredient to discard.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 14),

            // Quantity to Discard
            TextFormField(
              controller: _quantityController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Quantity to Discard (${_selectedItem?.unit ?? "units"})',
                prefixIcon: const Icon(Icons.scale_outlined, size: 20),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 14),

            // Reason Selector
            DropdownButtonFormField<String>(
              initialValue: _selectedReason,
              decoration: InputDecoration(
                labelText: 'Reason for Disposal',
                prefixIcon: const Icon(Icons.help_outline, size: 20),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
              items: _reasons.map((r) {
                return DropdownMenuItem(
                  value: r,
                  child: Text(r.replaceAll('_', ' ')),
                );
              }).toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    _selectedReason = val;
                  });
                }
              },
            ),
            const SizedBox(height: 20),

            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.red.shade700,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: kitchenProvider.isSubmitting ? null : _submitWaste,
                icon: kitchenProvider.isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.check),
                label: Text(
                  kitchenProvider.isSubmitting ? 'Recording Waste...' : 'Confirm Waste Disposal',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
