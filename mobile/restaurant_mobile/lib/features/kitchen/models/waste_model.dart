import 'package:flutter/material.dart';

class RecordWasteRequest {
  final String stockBatchId;
  final double quantity;
  final String reason;

  const RecordWasteRequest({
    required this.stockBatchId,
    required this.quantity,
    required this.reason,
  });

  Map<String, dynamic> toJson() {
    return {
      'stockBatchId': stockBatchId,
      'quantity': quantity,
      'reason': reason,
    };
  }
}

class WasteRecordModel {
  final String id;
  final String ingredientId;
  final String ingredientName;
  final String stockBatchId;
  final String stockBatchNumber;
  final double quantity;
  final String reason;
  final String reportedById;
  final String reportedByName;
  final String status;
  final DateTime recordedAt;
  final String? confirmedByName;
  final DateTime? confirmedAt;

  const WasteRecordModel({
    required this.id,
    required this.ingredientId,
    required this.ingredientName,
    required this.stockBatchId,
    required this.stockBatchNumber,
    required this.quantity,
    required this.reason,
    required this.reportedById,
    required this.reportedByName,
    required this.status,
    required this.recordedAt,
    this.confirmedByName,
    this.confirmedAt,
  });

  factory WasteRecordModel.fromJson(Map<String, dynamic> json) {
    return WasteRecordModel(
      id: json['id']?.toString() ?? '',
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName: json['ingredientName']?.toString() ?? 'Ingredient',
      stockBatchId: json['stockBatchId']?.toString() ?? '',
      stockBatchNumber: json['stockBatchNumber']?.toString() ?? 'BATCH',
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0.0,
      reason: json['reason']?.toString() ?? 'OTHER',
      reportedById: json['reportedById']?.toString() ?? '',
      reportedByName: json['reportedByName']?.toString() ?? 'Staff',
      status: json['status']?.toString().toUpperCase() ?? 'PENDING',
      recordedAt: json['recordedAt'] != null
          ? DateTime.tryParse(json['recordedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      confirmedByName: json['confirmedByName']?.toString(),
      confirmedAt: json['confirmedAt'] != null
          ? DateTime.tryParse(json['confirmedAt'].toString())
          : null,
    );
  }

  bool get isConfirmed => status == 'CONFIRMED';

  Color get statusColor {
    switch (status) {
      case 'CONFIRMED':
        return Colors.green.shade700;
      case 'REJECTED':
        return Colors.red.shade700;
      case 'PENDING':
      default:
        return Colors.amber.shade800;
    }
  }

  Color get reasonBadgeColor {
    switch (reason.toUpperCase()) {
      case 'EXPIRED':
        return Colors.purple;
      case 'SPOILED':
        return Colors.deepOrange;
      case 'DAMAGED':
        return Colors.red;
      case 'PREPARATION_DEFECT':
      case 'BURNT':
        return Colors.brown;
      case 'CONTAMINATED':
        return Colors.pink.shade700;
      default:
        return Colors.blueGrey;
    }
  }

  String get shortId {
    if (id.length <= 8) return id;
    return 'WST-${id.substring(0, 8).toUpperCase()}';
  }
}
