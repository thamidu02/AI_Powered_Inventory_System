import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class BarcodeScannerModal extends StatefulWidget {
  final String title;

  const BarcodeScannerModal({
    super.key,
    this.title = 'Scan Batch QR / Barcode',
  });

  static Future<String?> show(
    BuildContext context, {
    String title = 'Scan Batch QR / Barcode',
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => BarcodeScannerModal(title: title),
    );
  }

  @override
  State<BarcodeScannerModal> createState() => _BarcodeScannerModalState();
}

class _BarcodeScannerModalState extends State<BarcodeScannerModal>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  final _manualController = TextEditingController();
  bool _isTorchOn = false;

  final List<String> _sampleBarcodes = [
    'BAT-10293-1',
    'BAT-58492-3',
    'BAT-99381-1',
    'BAT-44120-2',
  ];

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _animController.dispose();
    _manualController.dispose();
    super.dispose();
  }

  void _onCodeSelected(String code) {
    Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade400,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 14),

          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.qr_code_scanner, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Text(
                    widget.title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              IconButton(
                icon: Icon(
                  _isTorchOn ? Icons.flash_on : Icons.flash_off,
                  color: _isTorchOn ? Colors.amber : Colors.grey,
                ),
                tooltip: 'Toggle Flashlight',
                onPressed: () => setState(() => _isTorchOn = !_isTorchOn),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Viewfinder simulation
          Container(
            height: 180,
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Scan target frame
                Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.5),
                      width: 2,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                // Animated laser beam
                AnimatedBuilder(
                  animation: _animController,
                  builder: (ctx, child) {
                    return Positioned(
                      top: 30 + (_animController.value * 110),
                      child: Container(
                        width: 130,
                        height: 2,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.8),
                              blurRadius: 8,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                Positioned(
                  bottom: 12,
                  child: Text(
                    'Align batch QR code within the frame',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Quick tap sample tags
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Quick Sample Barcodes:',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: theme.hintColor,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _sampleBarcodes.map((code) {
              return ActionChip(
                avatar: const Icon(Icons.qr_code, size: 14),
                label: Text(code, style: const TextStyle(fontSize: 12)),
                onPressed: () => _onCodeSelected(code),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // Manual Entry Fallback
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _manualController,
                  decoration: const InputDecoration(
                    labelText: 'Or type barcode manually',
                    hintText: 'e.g. BAT-10293-1',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onSubmitted: (val) {
                    if (val.trim().isNotEmpty) _onCodeSelected(val.trim());
                  },
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: () {
                  if (_manualController.text.trim().isNotEmpty) {
                    _onCodeSelected(_manualController.text.trim());
                  }
                },
                child: const Text('Use'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
