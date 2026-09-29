import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/acumatica_brand.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  final List<Map<String, String>> _demoAccounts = const [
    {
      'role': 'RESTAURANT_MANAGER',
      'name': 'Restaurant Manager',
      'email': 'manager@restaurant.com',
      'password': 'Restaurant@123',
      'description': 'Approves purchase requests & stock adjustments',
    },
    {
      'role': 'INVENTORY_MANAGER',
      'name': 'Inventory Manager',
      'email': 'inventory@restaurant.com',
      'password': 'Restaurant@123',
      'description': 'Receives goods, transfers & audit checks',
    },
    {
      'role': 'PROCUREMENT_OFFICER',
      'name': 'Procurement Officer',
      'email': 'procurement@restaurant.com',
      'password': 'Restaurant@123',
      'description': 'Monitors stock thresholds & issues orders',
    },
    {
      'role': 'SALES_KITCHEN_STAFF',
      'name': 'Kitchen Staff',
      'email': 'staff@restaurant.com',
      'password': 'Restaurant@123',
      'description': 'Logs recipe prep, POS sales & waste records',
    },
    {
      'role': 'SYSTEM_ADMIN',
      'name': 'System Admin',
      'email': 'admin@restaurant.com',
      'password': 'Restaurant@123',
      'description': 'Full administrative control & master data CRUD',
    },
  ];

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _selectDemoAccount(Map<String, String> account) {
    setState(() {
      _emailController.text = account['email']!;
      _passwordController.text = account['password']!;
    });
    context.read<AuthProvider>().clearError();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    final authProvider = context.read<AuthProvider>();
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    final success = await authProvider.login(email, password);
    if (!success && mounted && authProvider.errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.error_outline, color: Colors.white, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text(authProvider.errorMessage!)),
            ],
          ),
          backgroundColor: AppColors.alertText,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final size = MediaQuery.of(context).size;
    final isWideScreen = size.width >= 820;

    if (isWideScreen) {
      return Scaffold(
        backgroundColor: Colors.white,
        body: Row(
          children: [
            // Left Hero Pane (Acumatica Enterprise Cloud Style)
            Expanded(
              flex: 5,
              child: _buildHeroPane(context),
            ),
            // Right Form Pane
            Expanded(
              flex: 4,
              child: Container(
                color: Colors.white,
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 32),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: _buildFormContent(context, auth),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Standard Handheld / Phone Layout
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: _buildFormContent(context, auth),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeroPane(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF0F172A),
            Color(0xFF1E293B),
            Color(0xFF00385E),
          ],
        ),
      ),
      padding: const EdgeInsets.all(56),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Top logo
          const Row(
            children: [
              AcumaticaLogoSphere(size: 38, ringSize: 20),
              SizedBox(width: 12),
              Text(
                'Acumatica Cloud ERP',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),

          // Central value proposition
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.primaryLight.withValues(alpha: 0.4)),
                ),
                child: const Text(
                  'RESTAURANT INVENTORY & PROCUREMENT',
                  style: TextStyle(
                    color: AppColors.primaryLight,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'AI-Powered Precision.\nFEFO Traceability.\nZero Guesswork.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                  letterSpacing: -0.8,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Connect kitchen consumption, automated goods receiving, safety stock thresholds, and multi-agent AI recommendations in one unified ERP console.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75),
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
            ],
          ),

          // Bottom metrics summary
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _HeroMetric(label: 'Real-time Stock', value: 'Live FEFO'),
                _HeroMetric(label: 'Agent Intelligence', value: 'Gemini 2.5'),
                _HeroMetric(label: 'Cloud System', value: 'Acumatica'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFormContent(BuildContext context, AuthProvider auth) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Acumatica Brand Header
          const AcumaticaBrandHeader(
            isCentered: false,
            logoSize: 44,
            titleSize: 26,
            showTagline: true,
          ),
          const SizedBox(height: 32),

          // Section Header: Enter credentials
          const Text(
            'Enter credentials',
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: AppColors.textMain,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Sign in to access your inventory and procurement console',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.textMuted,
            ),
          ),
          const SizedBox(height: 20),

          // Acumatica Error Alert Banner
          if (auth.errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.alertBg,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: AppColors.alertBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: AppColors.alertText, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      auth.errorMessage!,
                      style: const TextStyle(
                        color: AppColors.alertText,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Email Field
          const Text(
            'Username / Email',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            style: const TextStyle(fontSize: 14, color: AppColors.textMain),
            decoration: InputDecoration(
              hintText: 'name@restaurant.com',
              prefixIcon: const Icon(Icons.mail_outline, size: 18, color: Color(0xFF94A3B8)),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.primary, width: 1.8),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Please enter your email';
              }
              if (!value.contains('@') || !value.contains('.')) {
                return 'Please enter a valid email address';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),

          // Password Field
          const Text(
            'Password',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 6),
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _handleLogin(),
            style: const TextStyle(fontSize: 14, color: AppColors.textMain),
            decoration: InputDecoration(
              hintText: '••••••••',
              prefixIcon: const Icon(Icons.lock_outline, size: 18, color: Color(0xFF94A3B8)),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  size: 18,
                  color: const Color(0xFF94A3B8),
                ),
                onPressed: () {
                  setState(() {
                    _obscurePassword = !_obscurePassword;
                  });
                },
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(4),
                borderSide: const BorderSide(color: AppColors.primary, width: 1.8),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return 'Please enter your password';
              }
              return null;
            },
          ),
          const SizedBox(height: 20),

          // Acumatica Sign In Button
          SizedBox(
            height: 42,
            child: FilledButton(
              onPressed: auth.isLoading ? null : _handleLogin,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(4),
                ),
                elevation: 0,
              ),
              child: auth.isLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Sign In',
                          style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(width: 6),
                        Icon(Icons.arrow_forward, size: 16),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 28),

          // Acumatica Quick Demo Accounts Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'QUICK DEMO ACCESS',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: AppColors.textMuted,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.demoBadgeBg,
                  borderRadius: BorderRadius.circular(3),
                  border: Border.all(color: AppColors.demoBadgeBorder),
                ),
                child: const Text(
                  '5 Roles Available',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.demoBadgeText,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Demo Roles Grid (2-column Acumatica style cards)
          Column(
            children: [
              Row(
                children: [
                  Expanded(child: _buildRoleCard(_demoAccounts[0])),
                  const SizedBox(width: 8),
                  Expanded(child: _buildRoleCard(_demoAccounts[1])),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: _buildRoleCard(_demoAccounts[2])),
                  const SizedBox(width: 8),
                  Expanded(child: _buildRoleCard(_demoAccounts[3])),
                ],
              ),
              const SizedBox(height: 8),
              _buildRoleCard(_demoAccounts[4]),
            ],
          ),
          const SizedBox(height: 24),

          // Footer
          const Center(
            child: Column(
              children: [
                Text(
                  'Copyright © 2026 Savory Inventory System. All rights reserved.',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textMuted,
                  ),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 2),
                Text(
                  'Restaurant Operations • Acumatica Cloud ERP Theme',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoleCard(Map<String, String> account) {
    final isSelected = _emailController.text == account['email'];

    return InkWell(
      onTap: () => _selectDemoAccount(account),
      borderRadius: BorderRadius.circular(4),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.demoBadgeBg : AppColors.surfaceSubtle,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.borderSubtle,
            width: isSelected ? 1.4 : 1.0,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _getRoleIcon(account['role']!),
                  size: 13,
                  color: isSelected ? AppColors.primary : AppColors.textMuted,
                ),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    account['name']!,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? AppColors.primaryDark : AppColors.textMain,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              account['role']!.replaceAll('_', ' '),
              style: const TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
                letterSpacing: 0.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              account['description']!,
              style: const TextStyle(
                fontSize: 9.5,
                color: AppColors.textMuted,
                height: 1.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  IconData _getRoleIcon(String role) {
    switch (role) {
      case 'RESTAURANT_MANAGER':
        return Icons.business_center_outlined;
      case 'INVENTORY_MANAGER':
        return Icons.inventory_2_outlined;
      case 'PROCUREMENT_OFFICER':
        return Icons.local_shipping_outlined;
      case 'SALES_KITCHEN_STAFF':
        return Icons.restaurant_menu_outlined;
      case 'SYSTEM_ADMIN':
        return Icons.admin_panel_settings_outlined;
      default:
        return Icons.person_outline;
    }
  }
}

class _HeroMetric extends StatelessWidget {
  final String label;
  final String value;

  const _HeroMetric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 10,
          ),
        ),
      ],
    );
  }
}
