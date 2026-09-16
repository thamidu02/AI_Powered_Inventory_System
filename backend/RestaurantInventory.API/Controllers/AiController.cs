using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.AI;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize(Roles = "INVENTORY_MANAGER")]
public class AiController : ControllerBase
{
    private readonly IAiProxyService _ai;

    public AiController(IAiProxyService ai)
    {
        _ai = ai;
    }

    // ============================================================
    // CHAT — SSE stream
    // ============================================================

    [HttpPost("chat")]
    public async Task Chat(
        [FromBody] AiChatRequest req,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();

        Response.ContentType  = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        try
        {
            await foreach (var chunk in _ai.StreamChatAsync(
                req.Message, userId, req.WorkflowId, ct))
            {
                if (ct.IsCancellationRequested) break;

                var bytes = Encoding.UTF8.GetBytes(chunk);
                await Response.Body.WriteAsync(bytes, ct);
                await Response.Body.FlushAsync(ct);
            }

        }
        catch (OperationCanceledException)
        {
            // Client disconnected — normal
        }

    }

    [HttpPost("sales-waste/analyze")]
    public async Task AnalyzeSalesWaste(
        [FromBody] AiSalesWasteAnalyzeRequest? req,
        CancellationToken ct)
    {
        var days = Math.Clamp(req?.Days ?? 30, 1, 366);
        var userId = GetCurrentUserId();
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        var message = $"Run the Component 3 sales, consumption, waste and recommendation workflow for the last {days} days.";
        await foreach (var chunk in _ai.StreamChatAsync(message, userId, null, ct))
        {
            if (ct.IsCancellationRequested) break;
            await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(chunk), ct);
            await Response.Body.FlushAsync(ct);
        }
    }

    // ============================================================
    // LIST WORKFLOWS
    // ============================================================

    [HttpGet("workflows")]
    public async Task<IActionResult> GetWorkflows()
    {
        var userId = GetCurrentUserId();
        var result = await _ai.GetWorkflowsAsync(userId);
        return Ok(result);
    }

    // ============================================================
    // APPROVE / REJECT WORKFLOW
    // ============================================================

    [HttpPost("workflows/{workflowId}/approve")]
    public async Task<IActionResult> ApproveWorkflow(
        string workflowId,
        [FromBody] AiApprovalRequest req)
    {
        var reviewerId = GetCurrentUserId();

        var result = await _ai.ApproveWorkflowAsync(
            workflowId,
            req.Decision,
            req.Comment,
            reviewerId);

        return Ok(result);
    }

    // ============================================================
    // CURRENT USER HELPER
    // ============================================================

    private string GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (string.IsNullOrEmpty(userId))
            throw new UnauthorizedAccessException("Invalid user identity.");

        return userId;
    }
}
