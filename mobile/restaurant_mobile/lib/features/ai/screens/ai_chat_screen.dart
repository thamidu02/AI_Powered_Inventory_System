import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_colors.dart';
import '../models/ai_message_model.dart';
import '../providers/ai_provider.dart';

class AiChatScreen extends StatefulWidget {
  const AiChatScreen({super.key});

  @override
  State<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends State<AiChatScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  final List<String> _quickPrompts = const [
    'Check low stock',
    'Expiring batches',
    'Check PR duplicate requests',
    'Stock levels of chicken breast',
    'Explain recent waste reasons',
  ];

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _handleSend([String? textOverride]) {
    final text = textOverride ?? _textController.text;
    if (text.trim().isEmpty) return;

    _textController.clear();
    context.read<AiProvider>().sendMessage(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final aiProvider = context.watch<AiProvider>();
    final messages = aiProvider.messages;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.auto_awesome, color: AppColors.primary, size: 20),
            SizedBox(width: 8),
            Text('AI Inventory Assistant'),
          ],
        ),
        actions: [
          if (messages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline, size: 20),
              tooltip: 'Clear Chat',
              onPressed: () => aiProvider.clearChat(),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Quick Action Prompt Chips
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                border: const Border(
                  bottom: BorderSide(color: AppColors.border, width: 0.8),
                ),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _quickPrompts.map((prompt) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 8.0),
                      child: ActionChip(
                        avatar: const Icon(
                          Icons.bolt,
                          size: 14,
                          color: AppColors.primary,
                        ),
                        label: Text(
                          prompt,
                          style: const TextStyle(fontSize: 12),
                        ),
                        backgroundColor: AppColors.surfaceSubtle,
                        side: const BorderSide(color: AppColors.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        onPressed: aiProvider.isProcessing
                            ? null
                            : () => _handleSend(prompt),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),

            // Messages List
            Expanded(
              child: messages.isEmpty
                  ? _buildEmptyState(theme)
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final msg = messages[index];
                        return _buildMessageRow(context, msg);
                      },
                    ),
            ),

            // Input Bar
            _buildInputBar(context, aiProvider),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.primaryGlow,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.psychology_outlined,
                size: 48,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Restaurant AI Copilot',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Ask real-time questions about stock levels, batch expiries, demand projections, or compliance audits.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageRow(BuildContext context, AiMessage msg) {
    if (msg.isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12, left: 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(16)
                .copyWith(bottomRight: const Radius.circular(2)),
          ),
          child: Text(
            msg.text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.4,
            ),
          ),
        ),
      );
    }

    // Bot message bubble
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16, right: 24),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16)
              .copyWith(topLeft: const Radius.circular(2)),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header (Icon + Status / Intent)
            Row(
              children: [
                const Icon(
                  Icons.auto_awesome,
                  color: AppColors.primary,
                  size: 16,
                ),
                const SizedBox(width: 6),
                Text(
                  msg.intent != null
                      ? msg.intent!.replaceAll('_', ' ').toLowerCase()
                      : 'Inventory Assistant',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Live status text while streaming
            if (msg.isStreaming && (msg.statusText?.isNotEmpty ?? false)) ...[
              Row(
                children: [
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      msg.statusText!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.primary,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Message text body (7-section structured response)
            if (msg.text.isNotEmpty)
              SelectableText(
                msg.text,
                style: const TextStyle(
                  fontSize: 13.5,
                  height: 1.55,
                  color: AppColors.textMain,
                ),
              ),

            // Proposal Approval Card (if high-impact proposal generated)
            if (msg.hasProposal) ...[
              const SizedBox(height: 14),
              _buildProposalCard(context, msg),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildProposalCard(BuildContext context, AiMessage msg) {
    final proposal = msg.proposal!;
    final proposalType = proposal['proposal_type'] ?? 'PURCHASE_REQUEST';
    final totalCost = proposal['total_cost'];
    final itemCount =
        proposal['item_count'] ?? (proposal['items'] as List?)?.length ?? 0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceSubtle,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                proposalType == 'PURCHASE_REQUEST'
                    ? 'Purchase Request Proposal'
                    : 'Reorder Level Proposal',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: AppColors.textMain,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.amberGlow,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'Manager approval required',
                  style: TextStyle(
                    color: AppColors.amber,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Items: $itemCount | Total Estimated Cost: \$${totalCost ?? '0.00'}',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 12),

          // Action Button / Approved Badge
          if (msg.isApproved)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.emeraldGlow,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle, color: AppColors.emerald, size: 16),
                  SizedBox(width: 6),
                  Text(
                    'Approved & Created in Backend',
                    style: TextStyle(
                      color: AppColors.emerald,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            )
          else
            FilledButton.icon(
              onPressed: msg.isApproving
                  ? null
                  : () async {
                      final success = await context
                          .read<AiProvider>()
                          .approveProposal(msg);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              success
                                  ? 'Proposal approved successfully! Purchase Request created.'
                                  : 'Approval submission failed. Please check permissions.',
                            ),
                            backgroundColor: success
                                ? AppColors.emerald
                                : AppColors.rose,
                          ),
                        );
                      }
                    },
              icon: msg.isApproving
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.check, size: 16),
              label: Text(
                msg.isApproving ? 'Submitting...' : 'Approve — Create PR',
                style: const TextStyle(fontSize: 12),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildInputBar(BuildContext context, AiProvider aiProvider) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border, width: 0.8)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              decoration: InputDecoration(
                hintText: 'Ask inventory AI...',
                hintStyle: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textMuted,
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(
                    color: AppColors.primary,
                    width: 1.5,
                  ),
                ),
              ),
              onSubmitted: aiProvider.isProcessing
                  ? null
                  : (_) => _handleSend(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: aiProvider.isProcessing ? null : () => _handleSend(),
            icon: const Icon(Icons.send, size: 18),
            style: IconButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.all(12),
            ),
          ),
        ],
      ),
    );
  }
}
