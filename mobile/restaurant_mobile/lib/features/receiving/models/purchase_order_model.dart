import 'package:flutter/material.dart';

class PurchaseOrderItemModel {
  final String id;
  final String purchaseOrderId;
  final String ingredientId;
  final String ingredientName;
  final String ingredientUnit;
  final double orderedQuantity;
  final double unitPrice;
  final double receivedQuantity;

  const PurchaseOrderItemModel({
    required this.id,
    required this.purchaseOrderId,
    required this.ingredientId,
    required this.ingredientName,
    required this.ingredientUnit,
    required this.orderedQuantity,
    required this.unitPrice,
    this.receivedQuantity = 0.0,
  });

  factory PurchaseOrderItemModel.fromJson(Map<String, dynamic> json) {
    return PurchaseOrderItemModel(
      id: json['id']?.toString() ?? '',
      purchaseOrderId: json['purchaseOrderId']?.toString() ?? '',
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName: json['ingredientName']?.toString() ?? 'Unknown Ingredient',
      ingredientUnit: json['ingredientUnit']?.toString() ?? 'units',
      orderedQuantity: (json['orderedQuantity'] as num?)?.toDouble() ?? 0.0,
      unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0.0,
      receivedQuantity: (json['receivedQuantity'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'purchaseOrderId': purchaseOrderId,
      'ingredientId': ingredientId,
      'ingredientName': ingredientName,
      'ingredientUnit': ingredientUnit,
      'orderedQuantity': orderedQuantity,
      'unitPrice': unitPrice,
      'receivedQuantity': receivedQuantity,
    };
  }

  double get remainingQuantity {
    final diff = orderedQuantity - receivedQuantity;
    return diff > 0 ? diff : 0.0;
  }

  bool get isFullyReceived => remainingQuantity <= 0.0001;

  double get fulfillmentRatio {
    if (orderedQuantity <= 0) return 1.0;
    final ratio = receivedQuantity / orderedQuantity;
    return ratio > 1.0 ? 1.0 : (ratio < 0 ? 0.0 : ratio);
  }
}

class PurchaseOrderModel {
  final String id;
  final String supplierId;
  final String supplierName;
  final String status;
  final DateTime? orderDate;
  final DateTime? expectedDeliveryDate;
  final double totalAmount;
  final String? createdById;
  final String createdByName;
  final String? approvedByName;
  final List<PurchaseOrderItemModel> items;

  const PurchaseOrderModel({
    required this.id,
    required this.supplierId,
    required this.supplierName,
    required this.status,
    this.orderDate,
    this.expectedDeliveryDate,
    required this.totalAmount,
    this.createdById,
    this.createdByName = '',
    this.approvedByName,
    this.items = const [],
  });

  factory PurchaseOrderModel.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return PurchaseOrderModel(
      id: json['id']?.toString() ?? '',
      supplierId: json['supplierId']?.toString() ?? '',
      supplierName: json['supplierName']?.toString() ?? 'Unknown Supplier',
      status: json['status']?.toString().toUpperCase() ?? 'DRAFT',
      orderDate: json['orderDate'] != null ? DateTime.tryParse(json['orderDate'].toString()) : null,
      expectedDeliveryDate: json['expectedDeliveryDate'] != null
          ? DateTime.tryParse(json['expectedDeliveryDate'].toString())
          : null,
      totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0.0,
      createdById: json['createdById']?.toString(),
      createdByName: json['createdByName']?.toString() ?? '',
      approvedByName: json['approvedByName']?.toString(),
      items: rawItems
          .map((i) => PurchaseOrderItemModel.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get isEligibleForReceiving =>
      status == 'ORDERED' || status == 'PARTIALLY_RECEIVED';

  bool get isCompleted => status == 'COMPLETED';

  int get remainingItemsCount =>
      items.where((i) => !i.isFullyReceived).length;

  double get totalOrderedQuantity =>
      items.fold(0.0, (acc, item) => acc + item.orderedQuantity);

  double get totalReceivedQuantity =>
      items.fold(0.0, (acc, item) => acc + item.receivedQuantity);

  String get shortId {
    if (id.length <= 8) return id;
    return 'PO-${id.substring(0, 8).toUpperCase()}';
  }

  Color get statusColor {
    switch (status) {
      case 'ORDERED':
        return Colors.blue.shade700;
      case 'PARTIALLY_RECEIVED':
        return Colors.orange.shade800;
      case 'COMPLETED':
        return Colors.green.shade700;
      case 'APPROVED':
        return Colors.indigo.shade600;
      case 'PENDING_APPROVAL':
      case 'SUBMITTED':
        return Colors.amber.shade800;
      case 'CANCELLED':
      case 'REJECTED':
        return Colors.red.shade700;
      case 'DRAFT':
      default:
        return Colors.grey.shade600;
    }
  }

  String get statusLabel {
    switch (status) {
      case 'ORDERED':
        return 'READY TO RECEIVE';
      case 'PARTIALLY_RECEIVED':
        return 'PARTIALLY RECEIVED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'APPROVED':
        return 'APPROVED';
      case 'PENDING_APPROVAL':
        return 'PENDING APPROVAL';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'REJECTED':
        return 'REJECTED';
      default:
        return status;
    }
  }
}
