import 'package:flutter/foundation.dart';
import '../models/ai_message_model.dart';
import '../services/ai_service.dart';

class AiProvider extends ChangeNotifier {
  final AiService aiService;

  final List<AiMessage> _messages = [];
  bool _isProcessing = false;
  String? _currentWorkflowId;

  AiProvider({required this.aiService});

  List<AiMessage> get messages => List.unmodifiable(_messages);
  bool get isProcessing => _isProcessing;
  String? get currentWorkflowId => _currentWorkflowId;

  /// Sends a user message to the AI agent and updates the chat stream
  Future<void> sendMessage(String text) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty || _isProcessing) return;

    // Add User Message
    final userMsg = AiMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      text: cleanText,
      isUser: true,
      timestamp: DateTime.now(),
    );
    _messages.add(userMsg);

    // Placeholder Bot Message
    final botMsg = AiMessage(
      id: '${DateTime.now().millisecondsSinceEpoch}_bot',
      text: '',
      isUser: false,
      timestamp: DateTime.now(),
      isStreaming: true,
      statusText: 'Connecting to AI Agent...',
    );
    _messages.add(botMsg);
    _isProcessing = true;
    notifyListeners();

    try {
      await for (final event in aiService.streamChatMessage(
        cleanText,
        workflowId: _currentWorkflowId,
      )) {
        final type = event['type'] as String?;

        if (type == 'intent') {
          botMsg.intent = event['intent'] as String?;
          final wfId = event['workflow_id'] as String?;
          if (wfId != null && wfId.isNotEmpty) {
            botMsg.workflowId = wfId;
            _currentWorkflowId = wfId;
          }
        } else if (type == 'thinking') {
          botMsg.statusText = event['text'] as String? ?? 'Thinking...';
        } else if (type == 'tool_call') {
          final tool = event['tool'] as String? ?? 'inventory tool';
          botMsg.statusText = 'Querying $tool...';
        } else if (type == 'message') {
          final content = event['text'] as String? ?? '';
          botMsg.text = content;
          final wfId = event['workflow_id'] as String?;
          if (wfId != null && wfId.isNotEmpty) {
            botMsg.workflowId = wfId;
            _currentWorkflowId = wfId;
          }
        } else if (type == 'approval_required') {
          botMsg.proposal = event['proposal'] as Map<String, dynamic>?;
          final wfId = event['workflow_id'] as String?;
          if (wfId != null && wfId.isNotEmpty) {
            botMsg.workflowId = wfId;
            _currentWorkflowId = wfId;
          }
        } else if (type == 'done') {
          botMsg.isStreaming = false;
          botMsg.statusText = null;
        }

        notifyListeners();
      }
    } catch (e) {
      if (botMsg.text.isEmpty) {
        botMsg.text = 'Summary:\n• Connection to AI Service was interrupted.\n\nCurrent Situation:\n• Network or agent stream error: $e\n\nAnalysis:\n• Insufficient data to make a reliable recommendation.\n\nRecommendation:\n• Please verify network connectivity and retry the query.\n\nReason:\n• Live stream disconnected before response was completed.\n\nRequired Action:\n1. Check backend service status.\n2. Re-send your inquiry.\n\nApproval:\n• No approval required.';
      }
    } finally {
      botMsg.isStreaming = false;
      botMsg.statusText = null;
      _isProcessing = false;
      notifyListeners();
    }
  }

  /// Approve a pending purchase request proposal directly from mobile
  Future<bool> approveProposal(AiMessage msg) async {
    final wfId = msg.workflowId;
    if (wfId == null || wfId.isEmpty || msg.isApproving || msg.isApproved) {
      return false;
    }

    msg.isApproving = true;
    notifyListeners();

    final success = await aiService.approveWorkflow(wfId);
    msg.isApproving = false;
    if (success) {
      msg.isApproved = true;
    }
    notifyListeners();
    return success;
  }

  void clearChat() {
    _messages.clear();
    _currentWorkflowId = null;
    notifyListeners();
  }
}
