class UserModel {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String token;
  final DateTime expiresAt;

  UserModel({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.token,
    required this.expiresAt,
  });

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  bool get isSystemAdmin => role == 'SYSTEM_ADMIN';
  bool get isRestaurantManager => role == 'RESTAURANT_MANAGER';
  bool get isInventoryManager => role == 'INVENTORY_MANAGER';
  bool get isProcurementOfficer => role == 'PROCUREMENT_OFFICER';
  bool get isSalesKitchenStaff => role == 'SALES_KITCHEN_STAFF';

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['userId']?.toString() ?? json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      token: json['token']?.toString() ?? '',
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'].toString()) ?? DateTime.now().add(const Duration(hours: 12))
          : DateTime.now().add(const Duration(hours: 12)),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': id,
      'email': email,
      'fullName': fullName,
      'role': role,
      'token': token,
      'expiresAt': expiresAt.toIso8601String(),
    };
  }
}
