import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../constants/api_constants.dart';
import '../errors/api_exception.dart';
import 'storage_service.dart';

class ApiService {
  final http.Client _client;
  final StorageService storage;

  ApiService({
    required this.storage,
    http.Client? client,
  }) : _client = client ?? http.Client();

  Map<String, String> _buildHeaders({bool requiresAuth = true}) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requiresAuth) {
      final token = storage.getToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  Uri _buildUri(String path, [Map<String, dynamic>? queryParameters]) {
    final fullUrl = '${ApiConstants.baseUrl}$path';
    final uri = Uri.parse(fullUrl);
    if (queryParameters == null || queryParameters.isEmpty) {
      return uri;
    }

    final queryMap = queryParameters.map(
      (key, value) => MapEntry(key, value.toString()),
    );
    return uri.replace(queryParameters: queryMap);
  }

  dynamic _processResponse(http.Response response) {
    dynamic decoded;
    if (response.body.isNotEmpty) {
      try {
        decoded = jsonDecode(response.body);
      } catch (_) {
        decoded = response.body;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }

    String errorMessage = 'Request failed with status ${response.statusCode}';
    if (decoded is Map<String, dynamic>) {
      if (decoded.containsKey('message') && decoded['message'] != null) {
        errorMessage = decoded['message'].toString();
      } else if (decoded.containsKey('error') && decoded['error'] != null) {
        errorMessage = decoded['error'].toString();
      }
    }

    if (response.statusCode == 401) {
      storage.clearAuth();
      throw ApiException(
        message: 'Session expired. Please log in again.',
        statusCode: 401,
        details: decoded,
      );
    }

    if (response.statusCode == 403) {
      throw ApiException(
        message: 'Access denied: You lack sufficient role permissions.',
        statusCode: 403,
        details: decoded,
      );
    }

    throw ApiException(
      message: errorMessage,
      statusCode: response.statusCode,
      details: decoded,
    );
  }

  Future<dynamic> get(
    String endpoint, {
    Map<String, dynamic>? queryParams,
    bool requiresAuth = true,
  }) async {
    try {
      final uri = _buildUri(endpoint, queryParams);
      final headers = _buildHeaders(requiresAuth: requiresAuth);
      final response = await _client.get(uri, headers: headers);
      return _processResponse(response);
    } on SocketException catch (e) {
      throw ApiException(
        message: 'Cannot reach backend server. Check your network or host URL.',
        details: e.toString(),
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        message: 'Network client error: ${e.message}',
        details: e.toString(),
      );
    }
  }

  Future<dynamic> post(
    String endpoint, {
    dynamic body,
    bool requiresAuth = true,
  }) async {
    try {
      final uri = _buildUri(endpoint);
      final headers = _buildHeaders(requiresAuth: requiresAuth);
      final encodedBody = body != null ? jsonEncode(body) : null;
      final response = await _client.post(uri, headers: headers, body: encodedBody);
      return _processResponse(response);
    } on SocketException catch (e) {
      throw ApiException(
        message: 'Cannot reach backend server. Check your network or host URL.',
        details: e.toString(),
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        message: 'Network client error: ${e.message}',
        details: e.toString(),
      );
    }
  }

  Future<dynamic> put(
    String endpoint, {
    dynamic body,
    bool requiresAuth = true,
  }) async {
    try {
      final uri = _buildUri(endpoint);
      final headers = _buildHeaders(requiresAuth: requiresAuth);
      final encodedBody = body != null ? jsonEncode(body) : null;
      final response = await _client.put(uri, headers: headers, body: encodedBody);
      return _processResponse(response);
    } on SocketException catch (e) {
      throw ApiException(
        message: 'Cannot reach backend server. Check your network or host URL.',
        details: e.toString(),
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        message: 'Network client error: ${e.message}',
        details: e.toString(),
      );
    }
  }

  Future<dynamic> delete(
    String endpoint, {
    bool requiresAuth = true,
  }) async {
    try {
      final uri = _buildUri(endpoint);
      final headers = _buildHeaders(requiresAuth: requiresAuth);
      final response = await _client.delete(uri, headers: headers);
      return _processResponse(response);
    } on SocketException catch (e) {
      throw ApiException(
        message: 'Cannot reach backend server. Check your network or host URL.',
        details: e.toString(),
      );
    } on http.ClientException catch (e) {
      throw ApiException(
        message: 'Network client error: ${e.message}',
        details: e.toString(),
      );
    }
  }

  void dispose() {
    _client.close();
  }
}
