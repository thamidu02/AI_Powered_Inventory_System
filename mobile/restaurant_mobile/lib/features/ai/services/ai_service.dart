import 'dart:convert';
import '../../../core/services/api_service.dart';

class AiService {
  final ApiService api;

  AiService({required this.api});

  /// Streams events from the backend AI proxy endpoint (/api/ai/chat)
  Stream<Map<String, dynamic>> streamChatMessage(
    String message, {
    String? workflowId,
  }) async* {
    final payload = <String, dynamic>{
      'message': message,
      if (workflowId != null && workflowId.isNotEmpty) 'workflowId': workflowId,
    };

    await for (final line in api.streamSse('/api/ai/chat', body: payload)) {
      final trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      final jsonStr = trimmed.substring(5).trim();
      if (jsonStr.isEmpty) continue;

      try {
        final decoded = jsonDecode(jsonStr);
        if (decoded is Map<String, dynamic>) {
          yield decoded;
        }
      } catch (_) {
        // Skip malformed SSE chunks
      }
    }
  }

  /// Submits manager approval for a pending AI workflow proposal
  Future<bool> approveWorkflow(
    String workflowId, {
    String decision = 'APPROVED',
    String comment = 'Approved via Mobile App',
  }) async {
    try {
      await api.post(
        '/api/ai/workflows/$workflowId/approve',
        body: {
          'decision': decision,
          'comment': comment,
        },
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}
