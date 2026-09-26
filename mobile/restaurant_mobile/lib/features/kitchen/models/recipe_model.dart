class RecipeIngredientModel {
  final String ingredientId;
  final String ingredientName;
  final String unit;
  final double quantityRequired;

  const RecipeIngredientModel({
    required this.ingredientId,
    required this.ingredientName,
    required this.unit,
    required this.quantityRequired,
  });

  factory RecipeIngredientModel.fromJson(Map<String, dynamic> json) {
    return RecipeIngredientModel(
      ingredientId: json['ingredientId']?.toString() ?? '',
      ingredientName: json['ingredientName']?.toString() ?? 'Ingredient',
      unit: json['unit']?.toString() ?? 'units',
      quantityRequired: (json['quantityRequired'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'ingredientId': ingredientId,
      'ingredientName': ingredientName,
      'unit': unit,
      'quantityRequired': quantityRequired,
    };
  }
}

class RecipeModel {
  final String id;
  final String menuItemId;
  final String menuItemName;
  final int version;
  final bool isActive;
  final List<RecipeIngredientModel> ingredients;

  const RecipeModel({
    required this.id,
    required this.menuItemId,
    required this.menuItemName,
    required this.version,
    required this.isActive,
    this.ingredients = const [],
  });

  factory RecipeModel.fromJson(Map<String, dynamic> json) {
    final rawList = json['ingredients'] as List<dynamic>? ?? [];
    return RecipeModel(
      id: json['id']?.toString() ?? '',
      menuItemId: json['menuItemId']?.toString() ?? '',
      menuItemName: json['menuItemName']?.toString() ?? '',
      version: (json['version'] as num?)?.toInt() ?? 1,
      isActive: json['isActive'] as bool? ?? true,
      ingredients: rawList
          .map((i) => RecipeIngredientModel.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }
}
