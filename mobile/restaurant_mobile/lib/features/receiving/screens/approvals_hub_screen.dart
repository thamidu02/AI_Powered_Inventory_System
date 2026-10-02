import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_colors.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/purchase_order_model.dart';
import '../models/purchase_request_model.dart';
import '../providers/procurement_provider.dart';

class ApprovalsHubScreen extends StatefulWidget {
  const ApprovalsHubScreen({super.key});

  @override
  State<ApprovalsHubScreen> createState() => _ApprovalsHubScreenState();
}

class _ApprovalsHubScreenState extends State<ApprovalsHubScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProcurementProvider>().fetchProcurementData();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showRejectDialog(
    BuildContext context, {
    required bool isPr,
    required String id,
  }) {
    final reasonController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Reject ${isPr ? "Purchase Request" : "Purchase Order"}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Please specify a rejection reason for record tracking:'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Rejection Reason',
                hintText: 'e.g., Budget exceeded, supplier unavailable',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              Navigator.of(ctx).pop();
              final provider = context.read<ProcurementProvider>();
              final success = isPr
                  ? await provider.rejectRequest(
                      id,
                      reason: reasonController.text.trim(),
                    )
                  : await provider.rejectOrder(
                      id,
                      reason: reasonController.text.trim(),
                    );

              if (!context.mounted) return;
              if (success) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Item rejected successfully.'),
                    backgroundColor: AppColors.error,
                  ),
                );
              }
            },
            child: const Text('Confirm Reject'),
          ),
        ],
      ),
    );
  }

  Widget _buildPrCard(
    BuildContext context,
    PurchaseRequestModel pr,
    bool canApprove,
  ) {
    final provider = context.read<ProcurementProvider>();

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.assignment_outlined,
                      size: 20,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      pr.shortId,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: pr.statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: pr.statusColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    pr.status.replaceAll('_', ' '),
                    style: TextStyle(
                      color: pr.statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              'Requested by: ${pr.requestedByName}',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
            ),
            if (pr.reason != null && pr.reason!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Note: ${pr.reason}',
                style: const TextStyle(
                  fontSize: 13,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
            const Divider(height: 20),
            Text(
              'Requested Items (${pr.items.length}):',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(height: 6),
            ...pr.items.map(
              (item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '• ${item.ingredientName}',
                      style: const TextStyle(fontSize: 13),
                    ),
                    Text(
                      '${item.requestedQuantity} ${item.ingredientUnit}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (canApprove && pr.isPending) ...[
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton.icon(
                    onPressed: provider.isProcessingAction
                        ? null
                        : () =>
                              _showRejectDialog(context, isPr: true, id: pr.id),
                    icon: const Icon(
                      Icons.close,
                      size: 16,
                      color: AppColors.error,
                    ),
                    label: const Text(
                      'Reject',
                      style: TextStyle(color: AppColors.error),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: provider.isProcessingAction
                        ? null
                        : () async {
                            final ok = await provider.approveRequest(pr.id);
                            if (context.mounted && ok) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Purchase Request Approved!'),
                                  backgroundColor: AppColors.emerald,
                                ),
                              );
                            }
                          },
                    icon: const Icon(Icons.check, size: 16),
                    label: const Text('Approve PR'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.emerald,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPoCard(
    BuildContext context,
    PurchaseOrderModel po,
    bool canApprove,
  ) {
    final provider = context.read<ProcurementProvider>();
    final isPendingApproval =
        po.status == 'SUBMITTED' || po.status == 'PENDING_APPROVAL';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.local_shipping_outlined,
                      size: 20,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      po.shortId,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: po.statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: po.statusColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Text(
                    po.status.replaceAll('_', ' '),
                    style: TextStyle(
                      color: po.statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Vendor: ${po.supplierName}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                Text(
                  '\$${po.totalAmount.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            Text(
              'Order Items (${po.items.length}):',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            const SizedBox(height: 6),
            ...po.items.map(
              (item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '• ${item.ingredientName}',
                      style: const TextStyle(fontSize: 13),
                    ),
                    Text(
                      '${item.orderedQuantity} ${item.ingredientUnit}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (canApprove && isPendingApproval) ...[
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton.icon(
                    onPressed: provider.isProcessingAction
                        ? null
                        : () => _showRejectDialog(
                            context,
                            isPr: false,
                            id: po.id,
                          ),
                    icon: const Icon(
                      Icons.close,
                      size: 16,
                      color: AppColors.error,
                    ),
                    label: const Text(
                      'Reject',
                      style: TextStyle(color: AppColors.error),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.icon(
                    onPressed: provider.isProcessingAction
                        ? null
                        : () async {
                            final ok = await provider.approveOrder(po.id);
                            if (context.mounted && ok) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Purchase Order Approved!'),
                                  backgroundColor: AppColors.emerald,
                                ),
                              );
                            }
                          },
                    icon: const Icon(Icons.check, size: 16),
                    label: const Text('Approve PO'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.emerald,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ProcurementProvider>();
    final auth = context.watch<AuthProvider>();
    final isManager =
        auth.user?.role == 'RESTAURANT_MANAGER' ||
        auth.user?.role == 'SYSTEM_ADMIN';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manager Approvals'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => provider.fetchProcurementData(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.assignment_turned_in_outlined),
              text: 'Requests (${provider.requests.length})',
            ),
            Tab(
              icon: const Icon(Icons.local_shipping_outlined),
              text: 'Orders (${provider.orders.length})',
            ),
          ],
        ),
      ),
      body: provider.isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                // ── Tab 1: Purchase Requests ──────────────────────────────
                provider.requests.isEmpty
                    ? Center(
                        child: Text(
                          'No Purchase Requests found.',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () => provider.fetchProcurementData(),
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          itemCount: provider.requests.length,
                          itemBuilder: (ctx, i) => _buildPrCard(
                            context,
                            provider.requests[i],
                            isManager,
                          ),
                        ),
                      ),

                // ── Tab 2: Purchase Orders ────────────────────────────────
                provider.orders.isEmpty
                    ? Center(
                        child: Text(
                          'No Purchase Orders found.',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () => provider.fetchProcurementData(),
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          itemCount: provider.orders.length,
                          itemBuilder: (ctx, i) => _buildPoCard(
                            context,
                            provider.orders[i],
                            isManager,
                          ),
                        ),
                      ),
              ],
            ),
    );
  }
}
