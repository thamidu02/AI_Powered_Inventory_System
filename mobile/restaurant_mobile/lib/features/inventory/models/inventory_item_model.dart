import 'package:flutter/material.dart';

class StockBatchModel {
  final String id;
  final String batchNumber;
  final double quantity;
  final double unitCost;
  final DateTime receivedDate;
  final DateTime? expiryDate;
  final String status;
  final String storageLocationName;

  StockBatchModel({
    required this.id,
    required this.batchNumber,
    required this.quantity,
    required this.unitCost,
    required this.receivedDate,
    this.expiryDate,
    required this.status,
    required this.storageLocationName,
  });

  bool get isExpired {
    if (expiryDate == null) return false;
    return DateTime.now().isAfter(expiryDate!);
  }

  bool get isExpiringSoon {
    if (expiryDate == null) return false;
    final diff = expiryDate!.difference(DateTime.now()).inDays;
    return diff >= 0 && diff <= 3;
  }

  factory StockBatchModel.fromJson(Map<String, dynamic> json) {
    return StockBatchModel(
      id: json['id']?.toString() ?? '',
      batchNumber: json['batchNumber']?.toString() ?? '',
      quantity: (json['quantity'] is num) ? (json['quantity'] as num).toDouble() : 0.0,
      unitCost: (json['unitCost'] is num) ? (json['unitCost'] as num).toDouble() : 0.0,
      receivedDate: json['receivedDate'] != null
          ? DateTime.tryParse(json['receivedDate'].toString()) ?? DateTime.now()
          : DateTime.now(),
      expiryDate: json['expiryDate'] != null
          ? DateTime.tryParse(json['expiryDate'].toString())
          : null,
      status: json['status']?.toString() ?? 'AVAILABLE',
      storageLocationName: json['storageLocationName']?.toString() ?? 'Main Storage',
    );
  }
}

class InventoryItemModel {
  final String ingredientId;
  final String ingredientName;
  final String sku;
  final String unit;
  final double currentStock;
  final double minimumStockLevel;
  final double maximumStockLevel;
  final bool isLowStock;
  final List<StockBatchModel> batches;

  InventoryItemModel({
    required this.ingredientId,
    required this.ingredientName,
    required this.sku,
    required this.unit,
    required this.currentStock,
    required this.minimumStockLevel,
    required this.maximumStockLevel,
    required this.isLowStock,
    required this.batches,
  });

  bool get isOutOfStock => currentStock <= 0;

  double get deficit => (minimumStockLevel > currentStock)
      ? (minimumStockLevel - currentStock)
      : 0.0;

  double get stockRatio => minimumStockLevel > 0
      ? (currentStock / minimumStockLevel).clamp(0.0, 2.0)
      : 1.0;

  String get statusLabel {
    if (isOutOfStock) return 'OUT OF STOCK';
    if (isLowStock || currentStock < minimumStockLevel) return 'LOW STOCK';
    if (maximumStockLevel > 0 && currentStock > maximumStockLevel) return 'OVERSTOCKED';
    return 'OPTIMAL';
  }

  Color get statusColor {
    if (isOutOfStock) return Colors.red;
    if (isLowStock || currentStock < minimumStockLevel) return Colors.orange;
    if (maximumStockLevel > 0 && currentStock > maximumStockLevel) return Colors.purple;
    return Colors.green;
  }

  factory InventoryItemModel.fromJson(Map<String, dynamic> json) {
    final rawBatches = json['batches'] as List<dynamic>? ?? [];
    final parsedBatches = rawBatches
        .map((b) => StockBatchModel.fromJson(b as Map<String, dynamic>))
        .toList();

    return InventoryItemModel(
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName: json['ingredientName']?.toString() ?? '',
      sku: json['sku']?.toString() ?? '',
      unit: json['unit']?.toString() ?? '',
      currentStock: (json['currentStock'] is num) ? (json['currentStock'] as num).toDouble() : 0.0,
      minimumStockLevel: (json['minimumStockLevel'] is num) ? (json['minimumStockLevel'] as num).toDouble() : 0.0,
      maximumStockLevel: (json['maximumStockLevel'] is num) ? (json['maximumStockLevel'] as num).toDouble() : 0.0,
      isLowStock: json['isLowStock'] == true ||
          ((json['currentStock'] is num && json['minimumStockLevel'] is num) &&
              (json['currentStock'] as num) < (json['minimumStockLevel'] as num)),
      batches: parsedBatches,
    );
  }
}
