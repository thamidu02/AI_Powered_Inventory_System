import 'package:flutter/material.dart';

class PurchaseRequestItemModel {
  final String id;
  final String purchaseRequestId;
  final String ingredientId;
  final String ingredientName;
  final String ingredientUnit;
  final double requestedQuantity;
  final String? suggestedSupplierName;
  final String? notes;

  const PurchaseRequestItemModel({
    required this.id,
    required this.purchaseRequestId,
    required this.ingredientId,
    required this.ingredientName,
    required this.ingredientUnit,
    required this.requestedQuantity,
    this.suggestedSupplierName,
    this.notes,
  });

  factory PurchaseRequestItemModel.fromJson(Map<String, dynamic> json) {
    return PurchaseRequestItemModel(
      id: json['id']?.toString() ?? '',
      purchaseRequestId: json['purchaseRequestId']?.toString() ?? '',
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName:
          json['ingredientName']?.toString() ?? 'Unknown Ingredient',
      ingredientUnit: json['ingredientUnit']?.toString() ?? 'units',
      requestedQuantity: (json['requestedQuantity'] as num?)?.toDouble() ?? 0.0,
      suggestedSupplierName: json['suggestedSupplierName']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class PurchaseRequestModel {
  final String id;
  final String status;
  final String? reason;
  final DateTime requestedAt;
  final String requestedById;
  final String requestedByName;
  final String? approvedByName;
  final DateTime? approvedAt;
  final List<PurchaseRequestItemModel> items;

  const PurchaseRequestModel({
    required this.id,
    required this.status,
    this.reason,
    required this.requestedAt,
    required this.requestedById,
    required this.requestedByName,
    this.approvedByName,
    this.approvedAt,
    this.items = const [],
  });

  factory PurchaseRequestModel.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return PurchaseRequestModel(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString().toUpperCase() ?? 'PENDING_APPROVAL',
      reason: json['reason']?.toString(),
      requestedAt: json['requestedAt'] != null
          ? DateTime.tryParse(json['requestedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      requestedById: json['requestedById']?.toString() ?? '',
      requestedByName: json['requestedByName']?.toString() ?? 'Kitchen / AI',
      approvedByName: json['approvedByName']?.toString(),
      approvedAt: json['approvedAt'] != null
          ? DateTime.tryParse(json['approvedAt'].toString())
          : null,
      items: rawItems
          .map(
            (i) => PurchaseRequestItemModel.fromJson(i as Map<String, dynamic>),
          )
          .toList(),
    );
  }

  String get shortId {
    if (id.length <= 8) return id;
    return 'PR-${id.substring(0, 8).toUpperCase()}';
  }

  bool get isPending => status == 'PENDING_APPROVAL';
  bool get isApproved => status == 'APPROVED';
  bool get isRejected => status == 'REJECTED';

  double get totalQuantity =>
      items.fold(0.0, (acc, item) => acc + item.requestedQuantity);

  Color get statusColor {
    switch (status) {
      case 'PENDING_APPROVAL':
        return Colors.orange.shade800;
      case 'APPROVED':
        return Colors.green.shade700;
      case 'REJECTED':
        return Colors.red.shade700;
      case 'CANCELLED':
        return Colors.grey.shade600;
      default:
        return Colors.blue.shade700;
    }
  }
}
