import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_colors.dart';
import '../models/inventory_item_model.dart';
import '../providers/inventory_provider.dart';

class StockAdjustmentModal extends StatefulWidget {
  final InventoryItemModel item;

  const StockAdjustmentModal({super.key, required this.item});

  @override
  State<StockAdjustmentModal> createState() => _StockAdjustmentModalState();
}

class _StockAdjustmentModalState extends State<StockAdjustmentModal> {
  final _formKey = GlobalKey<FormState>();
  final _qtyController = TextEditingController();
  final _customReasonController = TextEditingController();

  late StockBatchModel _selectedBatch;
  bool _isIncrease = false;
  String _selectedReason = 'COUNT_ERROR';
  bool _isSubmitting = false;

  final Map<String, String> _reasons = {
    'COUNT_ERROR': 'Physical Count Discrepancy',
    'DAMAGED': 'Damaged / Spilled Stock',
    'EXPIRED': 'Expired Stock Write-Off',
    'INTERNAL_USE': 'Kitchen Tasting / Prep Use',
  };

  @override
  void initState() {
    super.initState();
    if (widget.item.batches.isNotEmpty) {
      _selectedBatch = widget.item.batches.first;
    }
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _customReasonController.dispose();
    super.dispose();
  }

  Future<void> _submitAdjustment() async {
    if (!_formKey.currentState!.validate()) return;

    final rawQty = double.tryParse(_qtyController.text.trim()) ?? 0.0;
    if (rawQty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Quantity change must be greater than zero.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    final signedQty = _isIncrease ? rawQty : -rawQty;
    final reasonText = _customReasonController.text.trim().isNotEmpty
        ? '${_reasons[_selectedReason]}: ${_customReasonController.text.trim()}'
        : _reasons[_selectedReason]!;

    setState(() => _isSubmitting = true);
    final provider = context.read<InventoryProvider>();

    final success = await provider.adjustStock(
      stockBatchId: _selectedBatch.id,
      quantityChange: signedQty,
      reason: reasonText,
    );

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (success) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Stock adjusted by ${signedQty > 0 ? "+$signedQty" : "$signedQty"} ${widget.item.unit}',
          ),
          backgroundColor: AppColors.emerald,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.errorMessage ?? 'Failed to adjust stock.'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (widget.item.batches.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.warning_amber_rounded,
              size: 48,
              color: Colors.amber,
            ),
            const SizedBox(height: 12),
            const Text(
              'No active batches found for this item.',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            const Text(
              'Use Goods Intake to record an incoming supplier delivery batch before performing adjustments.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.tune, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text(
                      'Floor Stock Adjustment',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            Text(
              widget.item.ingredientName,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
            const Divider(height: 24),

            // Select Batch
            DropdownButtonFormField<StockBatchModel>(
              initialValue: _selectedBatch,
              decoration: const InputDecoration(
                labelText: 'Select Batch to Adjust',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.qr_code_2),
              ),
              items: widget.item.batches.map((batch) {
                return DropdownMenuItem(
                  value: batch,
                  child: Text(
                    '${batch.batchNumber} (${batch.quantityRemaining} ${widget.item.unit})',
                    style: const TextStyle(fontSize: 14),
                  ),
                );
              }).toList(),
              onChanged: (val) {
                if (val != null) setState(() => _selectedBatch = val);
              },
            ),
            const SizedBox(height: 16),

            // Adjustment Direction: Increase (+) or Decrease (-)
            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Center(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.remove_circle_outline,
                            size: 16,
                            color: AppColors.error,
                          ),
                          SizedBox(width: 6),
                          Text('Decrease (-)'),
                        ],
                      ),
                    ),
                    selected: !_isIncrease,
                    selectedColor: AppColors.error.withValues(alpha: 0.15),
                    onSelected: (val) => setState(() => _isIncrease = false),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ChoiceChip(
                    label: const Center(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.add_circle_outline,
                            size: 16,
                            color: AppColors.emerald,
                          ),
                          SizedBox(width: 6),
                          Text('Increase (+)'),
                        ],
                      ),
                    ),
                    selected: _isIncrease,
                    selectedColor: AppColors.emerald.withValues(alpha: 0.15),
                    onSelected: (val) => setState(() => _isIncrease = true),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Quantity Input
            TextFormField(
              controller: _qtyController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: 'Quantity Change (${widget.item.unit})',
                hintText: 'e.g. 2.5',
                border: const OutlineInputBorder(),
                prefixIcon: const Icon(Icons.scale_outlined),
              ),
              validator: (val) {
                if (val == null || val.trim().isEmpty) return 'Enter quantity';
                final n = double.tryParse(val.trim());
                if (n == null || n <= 0) return 'Must be a positive number';
                return null;
              },
            ),
            const SizedBox(height: 16),

            // Reason Dropdown
            DropdownButtonFormField<String>(
              initialValue: _selectedReason,
              decoration: const InputDecoration(
                labelText: 'Adjustment Reason',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.assignment_outlined),
              ),
              items: _reasons.entries.map((e) {
                return DropdownMenuItem(value: e.key, child: Text(e.value));
              }).toList(),
              onChanged: (val) {
                if (val != null) setState(() => _selectedReason = val);
              },
            ),
            const SizedBox(height: 12),

            // Optional Note
            TextField(
              controller: _customReasonController,
              decoration: const InputDecoration(
                labelText: 'Optional Detail / Memo',
                hintText: 'e.g. Box dropped, morning count',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),

            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton.icon(
                onPressed: _isSubmitting ? null : _submitAdjustment,
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.check),
                label: Text(
                  _isSubmitting ? 'Submitting...' : 'Apply Stock Adjustment',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
