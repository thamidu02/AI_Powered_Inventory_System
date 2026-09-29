class AiMessage {
  final String id;
  String text;
  final bool isUser;
  final DateTime timestamp;
  String? intent;
  String? workflowId;
  bool isStreaming;
  String? statusText;
  Map<String, dynamic>? proposal;
  bool isApproved;
  bool isApproving;

  AiMessage({
    required this.id,
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.intent,
    this.workflowId,
    this.isStreaming = false,
    this.statusText,
    this.proposal,
    this.isApproved = false,
    this.isApproving = false,
  });

  bool get hasProposal => proposal != null;
}
