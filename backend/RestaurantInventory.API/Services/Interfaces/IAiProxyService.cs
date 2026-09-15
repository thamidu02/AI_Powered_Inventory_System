using RestaurantInventory.API.DTOs.AI;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IAiProxyService
{
    /// <summary>
    /// Streams SSE events from the Python AI service back to the caller.
    /// </summary>
    IAsyncEnumerable<string> StreamChatAsync(
        string message,
        string userId,
        string? workflowId,
        CancellationToken ct);

    Task<IReadOnlyList<AiWorkflowSummary>> GetWorkflowsAsync(string userId);

    Task<object?> ApproveWorkflowAsync(
        string workflowId,
        string decision,
        string? comment,
        string reviewerId);
}
