class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic details;

  ApiException({required this.message, this.statusCode, this.details});

  @override
  String toString() => 'ApiException: $message (status: $statusCode)';
}
