class GoodsReceiptItemRequest {
  final String purchaseOrderItemId;
  final String storageLocationId;
  final double receivedQuantity;
  final double? unitCost;
  final String? batchNumber;
  final DateTime? expiryDate;

  const GoodsReceiptItemRequest({
    required this.purchaseOrderItemId,
    required this.storageLocationId,
    required this.receivedQuantity,
    this.unitCost,
    this.batchNumber,
    this.expiryDate,
  });

  Map<String, dynamic> toJson() {
    return {
      'purchaseOrderItemId': purchaseOrderItemId,
      'storageLocationId': storageLocationId,
      'receivedQuantity': receivedQuantity,
      if (unitCost != null) 'unitCost': unitCost,
      if (batchNumber != null && batchNumber!.isNotEmpty) 'batchNumber': batchNumber,
      if (expiryDate != null) 'expiryDate': expiryDate!.toIso8601String(),
    };
  }
}

class CreateGoodsReceiptRequest {
  final String purchaseOrderId;
  final String? notes;
  final List<GoodsReceiptItemRequest> items;

  const CreateGoodsReceiptRequest({
    required this.purchaseOrderId,
    this.notes,
    required this.items,
  });

  Map<String, dynamic> toJson() {
    return {
      'purchaseOrderId': purchaseOrderId,
      if (notes != null && notes!.isNotEmpty) 'notes': notes,
      'items': items.map((i) => i.toJson()).toList(),
    };
  }
}

class GoodsReceiptItemModel {
  final String id;
  final String goodsReceiptId;
  final String purchaseOrderItemId;
  final String ingredientId;
  final String ingredientName;
  final String ingredientUnit;
  final String storageLocationId;
  final String storageLocationName;
  final String batchNumber;
  final double receivedQuantity;
  final double unitCost;
  final DateTime? expiryDate;
  final DateTime createdAt;

  const GoodsReceiptItemModel({
    required this.id,
    required this.goodsReceiptId,
    required this.purchaseOrderItemId,
    required this.ingredientId,
    required this.ingredientName,
    required this.ingredientUnit,
    required this.storageLocationId,
    required this.storageLocationName,
    required this.batchNumber,
    required this.receivedQuantity,
    required this.unitCost,
    this.expiryDate,
    required this.createdAt,
  });

  factory GoodsReceiptItemModel.fromJson(Map<String, dynamic> json) {
    return GoodsReceiptItemModel(
      id: json['id']?.toString() ?? '',
      goodsReceiptId: json['goodsReceiptId']?.toString() ?? '',
      purchaseOrderItemId: json['purchaseOrderItemId']?.toString() ?? '',
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName: json['ingredientName']?.toString() ?? 'Ingredient',
      ingredientUnit: json['ingredientUnit']?.toString() ?? 'units',
      storageLocationId: json['storageLocationId']?.toString() ?? '',
      storageLocationName: json['storageLocationName']?.toString() ?? 'Storage',
      batchNumber: json['batchNumber']?.toString() ?? '',
      receivedQuantity: (json['receivedQuantity'] as num?)?.toDouble() ?? 0.0,
      unitCost: (json['unitCost'] as num?)?.toDouble() ?? 0.0,
      expiryDate: json['expiryDate'] != null ? DateTime.tryParse(json['expiryDate'].toString()) : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class GoodsReceiptModel {
  final String id;
  final String purchaseOrderId;
  final String receivedById;
  final String receivedByName;
  final DateTime receiptDate;
  final String? notes;
  final List<GoodsReceiptItemModel> items;
  final DateTime createdAt;

  const GoodsReceiptModel({
    required this.id,
    required this.purchaseOrderId,
    required this.receivedById,
    required this.receivedByName,
    required this.receiptDate,
    this.notes,
    this.items = const [],
    required this.createdAt,
  });

  factory GoodsReceiptModel.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return GoodsReceiptModel(
      id: json['id']?.toString() ?? '',
      purchaseOrderId: json['purchaseOrderId']?.toString() ?? '',
      receivedById: json['receivedById']?.toString() ?? '',
      receivedByName: json['receivedByName']?.toString() ?? 'Staff',
      receiptDate: json['receiptDate'] != null
          ? DateTime.tryParse(json['receiptDate'].toString()) ?? DateTime.now()
          : DateTime.now(),
      notes: json['notes']?.toString(),
      items: rawItems
          .map((i) => GoodsReceiptItemModel.fromJson(i as Map<String, dynamic>))
          .toList(),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  String get shortId {
    if (id.length <= 8) return id;
    return 'GR-${id.substring(0, 8).toUpperCase()}';
  }

  double get totalReceivedQuantity =>
      items.fold(0.0, (acc, item) => acc + item.receivedQuantity);
}
