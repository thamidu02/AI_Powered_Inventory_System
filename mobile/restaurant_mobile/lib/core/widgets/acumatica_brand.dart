import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Acumatica-style 3D gradient sphere logo with concentric inner ring
class AcumaticaLogoSphere extends StatelessWidget {
  final double size;
  final double ringSize;

  const AcumaticaLogoSphere({
    super.key,
    this.size = 42,
    this.ringSize = 22,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          center: Alignment(-0.3, -0.4),
          radius: 0.9,
          colors: [
            AppColors.primaryLight, // #38BDF8
            AppColors.primary,      // #007ACC
            AppColors.primaryNavy,  // #0369A1
          ],
          stops: [0.0, 0.55, 1.0],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x59007ACC),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Container(
          width: ringSize,
          height: ringSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.95),
              width: ringSize * 0.16,
            ),
          ),
        ),
      ),
    );
  }
}

/// Acumatica Cloud ERP brand title with signature typography
class AcumaticaBrandHeader extends StatelessWidget {
  final bool isCentered;
  final double logoSize;
  final double titleSize;
  final bool showTagline;

  const AcumaticaBrandHeader({
    super.key,
    this.isCentered = true,
    this.logoSize = 42,
    this.titleSize = 24,
    this.showTagline = true,
  });

  @override
  Widget build(BuildContext context) {
    final titleWidget = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        AcumaticaLogoSphere(
          size: logoSize,
          ringSize: logoSize * 0.52,
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              RichText(
                text: TextSpan(
                  style: TextStyle(
                    fontSize: titleSize,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.5,
                    color: AppColors.textMain,
                    fontFamily: 'Inter',
                  ),
                  children: const [
                    TextSpan(text: 'Savory'),
                    TextSpan(
                      text: 'Inventory',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (showTagline) ...[
                const SizedBox(height: 2),
                const Text(
                  'AI-ASSISTED OPERATIONS & FEFO TRACEABILITY',
                  style: TextStyle(
                    fontSize: 9.0,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                    color: AppColors.textMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ],
    );

    if (isCentered) {
      return Center(child: titleWidget);
    }
    return titleWidget;
  }
}
