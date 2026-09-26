import 'package:flutter/material.dart';

class StorageLocationModel {
  final String id;
  final String name;
  final String? description;
  final String? temperatureType;
  final bool isActive;

  const StorageLocationModel({
    required this.id,
    required this.name,
    this.description,
    this.temperatureType,
    this.isActive = true,
  });

  factory StorageLocationModel.fromJson(Map<String, dynamic> json) {
    return StorageLocationModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unnamed Location',
      description: json['description']?.toString(),
      temperatureType: json['temperatureType']?.toString() ?? 'AMBIENT',
      isActive: json['isActive'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'temperatureType': temperatureType,
      'isActive': isActive,
    };
  }

  Color get temperatureBadgeColor {
    switch (temperatureType?.toUpperCase()) {
      case 'FROZEN':
        return Colors.indigo;
      case 'REFRIGERATED':
      case 'CHILLED':
        return Colors.cyan.shade700;
      case 'AMBIENT':
      case 'DRY':
      default:
        return Colors.amber.shade800;
    }
  }

  IconData get temperatureIcon {
    switch (temperatureType?.toUpperCase()) {
      case 'FROZEN':
        return Icons.ac_unit;
      case 'REFRIGERATED':
      case 'CHILLED':
        return Icons.kitchen;
      case 'AMBIENT':
      case 'DRY':
      default:
        return Icons.inventory_2_outlined;
    }
  }

  String get displayName {
    if (temperatureType != null && temperatureType!.isNotEmpty) {
      return '$name ($temperatureType)';
    }
    return name;
  }
}
