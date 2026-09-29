import 'package:flutter/material.dart';

/// Design tokens matching the web app's Acumatica Cloud ERP & Kinetic Cobalt theme.
class AppColors {
  // Brand & Accent Colors (Acumatica Cloud ERP)
  static const Color primary = Color(0xFF007ACC);       // Acumatica Cobalt Blue
  static const Color primaryDark = Color(0xFF005F9E);   // Acumatica Deep Blue / Hover
  static const Color primaryLight = Color(0xFF38BDF8);  // Acumatica Sky / Sphere Accent
  static const Color primaryNavy = Color(0xFF0369A1);   // Acumatica Deep Navy
  static const Color primaryGlow = Color(0x26007ACC);   // Subtle Blue Glow

  // Semantic Status Colors
  static const Color emerald = Color(0xFF059669);       // In Stock / Success
  static const Color emeraldGlow = Color(0x1F059669);
  static const Color amber = Color(0xFFD97706);         // Low Stock / Warning
  static const Color amberGlow = Color(0x1FD97706);
  static const Color rose = Color(0xFFE11D48);          // Out of Stock / Danger
  static const Color roseGlow = Color(0x1FE11D48);
  static const Color blue = Color(0xFF0284C7);          // Informational
  static const Color purple = Color(0xFF8B5CF6);        // AI / Intelligence

  // Light Mode Surfaces (Acumatica White & Clean Slate)
  static const Color background = Color(0xFFF4F6F9);     // Pearl / Slate 50
  static const Color surface = Color(0xFFFFFFFF);        // Pure White Card
  static const Color surfaceSubtle = Color(0xFFF8FAFC);  // Slate 50 Hover
  static const Color border = Color(0xFFD1D5DB);         // Acumatica Input Border
  static const Color borderSubtle = Color(0xFFE2E8F0);   // Acumatica Divider / Card Border
  static const Color textMain = Color(0xFF0F172A);       // Slate 900
  static const Color textSecondary = Color(0xFF334155);  // Slate 700 / Field Labels
  static const Color textMuted = Color(0xFF64748B);      // Slate 500 / Subtitles & Badges

  // Acumatica Specific Badges & Alerts
  static const Color alertBg = Color(0xFFFEF2F2);
  static const Color alertBorder = Color(0xFFFECACA);
  static const Color alertText = Color(0xFF991B1B);
  static const Color demoBadgeBg = Color(0xFFF0F9FF);
  static const Color demoBadgeBorder = Color(0xFFBAE6FD);
  static const Color demoBadgeText = Color(0xFF0284C7);

  // Dark Mode Surfaces
  static const Color darkBackground = Color(0xFF0B0F19); // Deep Slate / Charcoal
  static const Color darkSurface = Color(0xFF111827);    // Slate 900
  static const Color darkSurfaceSubtle = Color(0xFF1E293B);
  static const Color darkBorder = Color(0xFF1F2937);     // Slate 800
  static const Color darkTextMain = Color(0xFFF8FAFC);   // Slate 50
  static const Color darkTextSecondary = Color(0xFF94A3B8); // Slate 400
  static const Color darkTextMuted = Color(0xFF64748B);
}
