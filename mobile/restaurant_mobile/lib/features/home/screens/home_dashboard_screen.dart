import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../auth/providers/auth_provider.dart';
import '../../../core/constants/api_constants.dart';
import '../../inventory/screens/inventory_list_screen.dart';
import '../../receiving/screens/receiving_list_screen.dart';
import '../../kitchen/screens/kitchen_hub_screen.dart';
import '../../ai/screens/ai_chat_screen.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/acumatica_brand.dart';
import '../../receiving/screens/approvals_hub_screen.dart';
import '../../receiving/providers/procurement_provider.dart';
import '../models/weather_model.dart';
import '../services/weather_service.dart';

class HomeDashboardScreen extends StatefulWidget {
  const HomeDashboardScreen({super.key});

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  CurrentWeatherModel? _weather;
  bool _isLoadingWeather = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadWeather();
      try {
        Provider.of<ProcurementProvider>(
          context,
          listen: false,
        ).fetchProcurementData();
      } catch (_) {}
    });
  }

  Future<void> _loadWeather() async {
    try {
      final weatherService = Provider.of<WeatherService>(
        context,
        listen: false,
      );
      setState(() => _isLoadingWeather = true);
      final weather = await weatherService.getCurrentWeather();
      if (mounted) {
        setState(() {
          _weather = weather;
          _isLoadingWeather = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoadingWeather = false);
      }
    }
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm Sign Out'),
        content: const Text(
          'Are you sure you want to end your current session?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.read<AuthProvider>().logout();
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }

  IconData _getWeatherIcon(String condition) {
    final lower = condition.toLowerCase();
    if (lower.contains('rain') || lower.contains('drizzle')) {
      return Icons.water_drop_rounded;
    } else if (lower.contains('cloud')) {
      return Icons.cloud_rounded;
    } else if (lower.contains('thunder') || lower.contains('storm')) {
      return Icons.thunderstorm_rounded;
    } else if (lower.contains('snow')) {
      return Icons.ac_unit_rounded;
    }
    return Icons.wb_sunny_rounded;
  }

  Color _getWeatherColor(String condition) {
    final lower = condition.toLowerCase();
    if (lower.contains('rain') || lower.contains('drizzle')) {
      return AppColors.primary;
    } else if (lower.contains('cloud')) {
      return Colors.blueGrey;
    } else if (lower.contains('thunder')) {
      return AppColors.purple;
    }
    return AppColors.amber;
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    ProcurementProvider? procurement;
    try {
      procurement = Provider.of<ProcurementProvider>(context);
    } catch (_) {}
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    final isManager =
        user?.role == 'RESTAURANT_MANAGER' ||
        user?.role == 'PROCUREMENT_OFFICER' ||
        user?.role == 'SYSTEM_ADMIN';
    final isKitchen = user?.role == 'KITCHEN_STAFF';

    final pendingCount = procurement != null
        ? (procurement.pendingPrCount + procurement.pendingPoCount)
        : 0;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            AcumaticaLogoSphere(size: 26, ringSize: 13),
            SizedBox(width: 10),
            Text('SavoryInventory'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: () {
              _loadWeather();
              procurement?.fetchProcurementData();
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out',
            onPressed: () => _confirmLogout(context),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await Future.wait([
              _loadWeather(),
              if (procurement != null) procurement.fetchProcurementData(),
            ]);
          },
          child: ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              // User Profile Card
              Card(
                elevation: 0,
                color: colorScheme.surfaceContainerHighest.withValues(
                  alpha: 0.6,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(
                    color: colorScheme.outlineVariant.withValues(alpha: 0.5),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: colorScheme.primary,
                        foregroundColor: colorScheme.onPrimary,
                        child: Text(
                          (user?.fullName.isNotEmpty ?? false)
                              ? user!.fullName.substring(0, 1).toUpperCase()
                              : 'U',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.fullName ?? 'Authenticated User',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              user?.email ?? '',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.hintColor,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _formatRole(user?.role ?? ''),
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: colorScheme.onPrimaryContainer,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Weather & AI Demand Banner
              if (_isLoadingWeather)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: colorScheme.outlineVariant.withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Center(
                    child: SizedBox(
                      height: 24,
                      width: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                )
              else if (_weather != null)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        _getWeatherColor(_weather!.condition)
                            .withValues(alpha: 0.12),
                        colorScheme.surfaceContainerLow,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _getWeatherColor(_weather!.condition)
                          .withValues(alpha: 0.3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _getWeatherIcon(_weather!.condition),
                            color: _getWeatherColor(_weather!.condition),
                            size: 28,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      '${_weather!.temperature.toStringAsFixed(1)}°C',
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      _weather!.condition,
                                      style: TextStyle(
                                        fontSize: 14,
                                        color: theme.hintColor,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                                Text(
                                  '${_weather!.city}, ${_weather!.country} • Feels like ${_weather!.feelsLike.toStringAsFixed(1)}°C',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: theme.hintColor,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.bolt,
                                  size: 14,
                                  color: AppColors.primary,
                                ),
                                SizedBox(width: 2),
                                Text(
                                  'AI Demand',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (_weather!
                          .demandImpact
                          .recommendationNote
                          .isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: colorScheme.surface.withValues(alpha: 0.7),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(
                                Icons.insights,
                                size: 16,
                                color: AppColors.primary,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  _weather!.demandImpact.recommendationNote,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: theme.textTheme.bodyMedium?.color
                                        ?.withValues(alpha: 0.9),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              const SizedBox(height: 20),

              // Active Shift Header
              Text(
                'Restaurant Operations',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),

              // If Manager / Procurement Officer, show Approvals Hub prominently
              if (isManager) ...[
                _buildActionCard(
                  context,
                  icon: Icons.verified_user_outlined,
                  iconColor: AppColors.primary,
                  title: 'Manager Approvals',
                  subtitle: 'Review & sign off purchase requests and supplier purchase orders',
                  badgeText: pendingCount > 0
                      ? '$pendingCount Pending'
                      : 'Approvals',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ApprovalsHubScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
              ],

              // Kitchen Staff view prioritizes Kitchen Prep
              if (isKitchen) ...[
                _buildActionCard(
                  context,
                  icon: Icons.restaurant_menu_outlined,
                  iconColor: AppColors.amber,
                  title: 'Kitchen Prep & Waste',
                  subtitle: 'Log dish preparation, recipe consumption, and food waste',
                  badgeText: 'Live',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const KitchenHubScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
              ],

              // Operation Action Cards
              _buildActionCard(
                context,
                icon: Icons.inventory_2_outlined,
                iconColor: AppColors.primary,
                title: 'Stock & Inventory',
                subtitle:
                    'Check ingredient levels, batches, and low stock warnings',
                badgeText: 'Live',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const InventoryListScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              _buildActionCard(
                context,
                icon: Icons.move_to_inbox_outlined,
                iconColor: AppColors.emerald,
                title: 'Goods Receiving',
                subtitle: 'Record supplier delivery batches and intake goods',
                badgeText: 'Live',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const ReceivingListScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 10),

              if (!isKitchen) ...[
                _buildActionCard(
                  context,
                  icon: Icons.restaurant_menu_outlined,
                  iconColor: AppColors.amber,
                  title: 'Kitchen Prep & Waste',
                  subtitle: 'Log dish preparation, recipe consumption, and food waste',
                  badgeText: 'Live',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const KitchenHubScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
              ],

              _buildActionCard(
                context,
                icon: Icons.psychology_outlined,
                iconColor: AppColors.purple,
                title: 'AI Assistant',
                subtitle:
                    'Ask inventory queries, audit orders, and manage proposals',
                badgeText: 'Live AI',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const AiChatScreen()),
                  );
                },
              ),
              const SizedBox(height: 24),

              // Connection Info Box
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: colorScheme.outlineVariant.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      size: 16,
                      color: Colors.green,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'API Host: ${ApiConstants.baseUrl}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontFamily: 'monospace',
                          color: theme.hintColor,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionCard(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required String badgeText,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: colorScheme.outlineVariant.withValues(alpha: 0.4),
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: iconColor),
        ),
        title: Row(
          children: [
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                badgeText,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: theme.hintColor,
                ),
              ),
            ),
          ],
        ),
        subtitle: Text(
          subtitle,
          style: TextStyle(fontSize: 12, color: theme.hintColor),
        ),
        trailing: const Icon(Icons.chevron_right, size: 20),
        onTap: onTap,
      ),
    );
  }

  String _formatRole(String rawRole) {
    if (rawRole.isEmpty) return 'Staff Member';
    return rawRole.replaceAll('_', ' ');
  }
}
