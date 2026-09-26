class CreateSaleItemRequest {
  final String menuItemId;
  final int quantity;

  const CreateSaleItemRequest({
    required this.menuItemId,
    required this.quantity,
  });

  Map<String, dynamic> toJson() {
    return {
      'menuItemId': menuItemId,
      'quantity': quantity,
    };
  }
}

class CreateSaleRequest {
  final List<CreateSaleItemRequest> items;

  const CreateSaleRequest({required this.items});

  Map<String, dynamic> toJson() {
    return {
      'items': items.map((i) => i.toJson()).toList(),
    };
  }
}

class SaleItemModel {
  final String id;
  final String menuItemId;
  final String menuItemName;
  final int quantity;
  final double unitPrice;
  final double subtotal;

  const SaleItemModel({
    required this.id,
    required this.menuItemId,
    required this.menuItemName,
    required this.quantity,
    required this.unitPrice,
    required this.subtotal,
  });

  factory SaleItemModel.fromJson(Map<String, dynamic> json) {
    return SaleItemModel(
      id: json['id']?.toString() ?? '',
      menuItemId: json['menuItemId']?.toString() ?? '',
      menuItemName: json['menuItemName']?.toString() ?? 'Dish',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0.0,
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class SaleModel {
  final String id;
  final String recordedById;
  final String recordedByName;
  final DateTime saleDate;
  final double totalAmount;
  final String status;
  final List<SaleItemModel> items;

  const SaleModel({
    required this.id,
    required this.recordedById,
    required this.recordedByName,
    required this.saleDate,
    required this.totalAmount,
    required this.status,
    this.items = const [],
  });

  factory SaleModel.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? [];
    return SaleModel(
      id: json['id']?.toString() ?? '',
      recordedById: json['recordedById']?.toString() ?? '',
      recordedByName: json['recordedByName']?.toString() ?? 'Staff',
      saleDate: json['saleDate'] != null
          ? DateTime.tryParse(json['saleDate'].toString()) ?? DateTime.now()
          : DateTime.now(),
      totalAmount: (json['totalAmount'] as num?)?.toDouble() ?? 0.0,
      status: json['status']?.toString() ?? 'COMPLETED',
      items: rawItems
          .map((i) => SaleItemModel.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }

  int get totalDishesCount =>
      items.fold(0, (acc, item) => acc + item.quantity);

  String get shortId {
    if (id.length <= 8) return id;
    return 'ORD-${id.substring(0, 8).toUpperCase()}';
  }
}
