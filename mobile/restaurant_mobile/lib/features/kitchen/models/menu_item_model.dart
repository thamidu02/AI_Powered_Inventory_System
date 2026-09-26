class MenuItemModel {
  final String id;
  final String name;
  final String? description;
  final double sellingPrice;
  final bool isActive;
  final int recipeCount;

  const MenuItemModel({
    required this.id,
    required this.name,
    this.description,
    required this.sellingPrice,
    this.isActive = true,
    this.recipeCount = 0,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> json) {
    return MenuItemModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unnamed Dish',
      description: json['description']?.toString(),
      sellingPrice: (json['sellingPrice'] as num?)?.toDouble() ?? 0.0,
      isActive: json['isActive'] as bool? ?? true,
      recipeCount: (json['recipeCount'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'sellingPrice': sellingPrice,
      'isActive': isActive,
      'recipeCount': recipeCount,
    };
  }
}
