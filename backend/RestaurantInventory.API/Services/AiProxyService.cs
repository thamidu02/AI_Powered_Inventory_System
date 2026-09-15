using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.AI;
using RestaurantInventory.API.Models.AI;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

/// <summary>
/// Forwards chat messages to the Python AI service and relays SSE events back.
/// Also handles workflow persistence and approval side-effects.
/// </summary>
public class AiProxyService : IAiProxyService
{
    private readonly HttpClient      _http;
    private readonly ApplicationDbContext _db;
    private readonly string          _aiServiceUrl;

    public AiProxyService(
        HttpClient http,
        ApplicationDbContext db,
        IConfiguration cfg)
    {
        _http = http;
        _db   = db;
        _aiServiceUrl = cfg["AiService:BaseUrl"] ?? "http://localhost:8000";
    }

    // ─── Stream chat ─────────────────────────────────────────────────────────

    public async IAsyncEnumerable<string> StreamChatAsync(
        string message,
        string userId,
        string? workflowId,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var body = JsonSerializer.Serialize(new
        {
            message,
            user_id     = userId,
            workflow_id = workflowId
        });

        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_aiServiceUrl}/chat")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };

        request.Headers.Accept.Add(
            new MediaTypeWithQualityHeaderValue("text/event-stream"));

        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            ct);

        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        string? line;
        while ((line = await reader.ReadLineAsync(ct)) != null && !ct.IsCancellationRequested)
        {
            // Forward raw SSE lines (including blank lines) to the caller
            yield return line + "\n";
        }
    }

    // ─── Workflow list ────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<AiWorkflowSummary>> GetWorkflowsAsync(
        string userId)
    {
        var rows = await _db.AIWorkflows
            .AsNoTracking()
            .Where(w => w.StartedById.ToString() == userId)
            .OrderByDescending(w => w.CreatedAt)
            .Include(w => w.Steps)
            .Take(50)
            .ToListAsync();

        return rows.Select(w => new AiWorkflowSummary
        {
            Id           = w.Id.ToString(),
            WorkflowType = ExtractWorkflowType(w.Objective),
            Status       = w.Status,
            Objective    = w.Objective,
            StartedAt    = w.CreatedAt,
            CompletedAt  = w.CompletedAt,
            FinalOutcome = w.FinalOutcome,
            StepCount    = w.Steps.Count
        }).ToList();
    }

    // ─── Approve / reject ─────────────────────────────────────────────────────

    public async Task<object?> ApproveWorkflowAsync(
        string workflowId,
        string decision,
        string? comment,
        string reviewerId)
    {
        if (!Guid.TryParse(workflowId, out var wfGuid))
            throw new ArgumentException("Invalid workflow ID.");

        var workflow = await _db.AIWorkflows
            .Include(w => w.Steps)
            .Include(w => w.Approvals)
            .FirstOrDefaultAsync(w => w.Id == wfGuid)
            ?? throw new KeyNotFoundException("Workflow not found.");

        if (workflow.Status != "AWAITING_APPROVAL")
            throw new InvalidOperationException(
                $"Workflow is not awaiting approval (current: {workflow.Status}).");

        // Record the approval decision
        var approval = workflow.Approvals.FirstOrDefault(a => a.Status == "PENDING")
            ?? new AIApproval
            {
                WorkflowId   = wfGuid,
                RequestedById = workflow.StartedById,
            };

        if (!Guid.TryParse(reviewerId, out var reviewerGuid))
            throw new UnauthorizedAccessException("Invalid reviewer identity.");

        approval.ReviewedById = reviewerGuid;
        approval.Decision     = decision;
        approval.Comment      = comment;
        approval.Status       = decision == "APPROVED" ? "APPROVED" : "REJECTED";
        approval.ReviewedAt   = DateTime.UtcNow;

        if (approval.Id == Guid.Empty)
            _db.AIApprovals.Add(approval);

        workflow.Status      = decision == "APPROVED" ? "COMPLETED" : "REJECTED";
        workflow.CompletedAt = DateTime.UtcNow;

        object? result = null;

        if (decision == "APPROVED")
        {
            result = await ExecuteApprovalSideEffectAsync(workflow);
            workflow.FinalOutcome = "Approved and executed.";
        }
        else
        {
            workflow.FinalOutcome = $"Rejected. Reason: {comment ?? "No reason given."}";
        }

        await _db.SaveChangesAsync();
        return result;
    }

    // ─── Execute side-effects on approval ────────────────────────────────────

    private async Task<object?> ExecuteApprovalSideEffectAsync(AIWorkflow workflow)
    {
        // Find the last procurement step output (proposal JSON)
        var proposalStep = workflow.Steps
            .Where(s => s.AgentName == "ProcurementAgent" ||
                        s.AgentName == "EmergencyAgent"   ||
                        s.AgentName == "OptimizationAgent")
            .OrderByDescending(s => s.StepNumber)
            .FirstOrDefault();

        if (proposalStep?.OutputJson == null)
            return new { message = "No proposal to execute." };

        var output = JsonSerializer.Deserialize<JsonElement>(proposalStep.OutputJson);

        // LOW_STOCK_REPLENISHMENT or EMERGENCY — create PurchaseRequest
        if (output.TryGetProperty("purchase_request", out var pr))
        {
            return await CreatePurchaseRequestFromProposal(pr, workflow.StartedById);
        }

        // INVENTORY_OPTIMIZATION — update ingredient min/max levels
        if (output.TryGetProperty("optimizations", out var opts))
        {
            return await ApplyOptimizationsAsync(opts);
        }

        return new { message = "Executed." };
    }

    private async Task<object> CreatePurchaseRequestFromProposal(
        JsonElement pr, Guid requestedById)
    {
        var purchaseRequest = new PurchaseRequest
        {
            RequestedById = requestedById,
            Status        = "APPROVED",
            Reason        = "Created by AI Replenishment Agent",
            RequestedAt   = DateTime.UtcNow,
        };

        if (pr.TryGetProperty("items", out var items))
        {
            foreach (var item in items.EnumerateArray())
            {
                if (!Guid.TryParse(
                    item.GetProperty("ingredient_id").GetString(), out var ingId))
                    continue;
                if (!Guid.TryParse(
                    item.GetProperty("supplier_id").GetString(), out var supId))
                    continue;

                purchaseRequest.Items.Add(new PurchaseRequestItem
                {
                    IngredientId         = ingId,
                    SuggestedSupplierId  = supId,
                    RequestedQuantity    = item.GetProperty("quantity").GetDecimal(),
                    Notes                = item.TryGetProperty("reasoning", out var r)
                                              ? r.GetString() : null
                });
            }
        }

        _db.PurchaseRequests.Add(purchaseRequest);
        await _db.SaveChangesAsync();

        return new { purchaseRequestId = purchaseRequest.Id, message = "Purchase Request created." };
    }

    private async Task<object> ApplyOptimizationsAsync(JsonElement opts)
    {
        int updated = 0;
        foreach (var opt in opts.EnumerateArray())
        {
            if (!Guid.TryParse(
                opt.GetProperty("ingredient_id").GetString(), out var ingId))
                continue;

            var ingredient = await _db.Ingredients.FindAsync(ingId);
            if (ingredient == null) continue;

            if (opt.TryGetProperty("new_minimum", out var nm))
                ingredient.MinimumStockLevel = nm.GetDecimal();
            if (opt.TryGetProperty("new_maximum", out var nmx))
                ingredient.MaximumStockLevel = nmx.GetDecimal();

            updated++;
        }

        await _db.SaveChangesAsync();
        return new { ingredientsUpdated = updated, message = "Optimization applied." };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static string ExtractWorkflowType(string objective)
    {
        if (objective.Contains("LOW_STOCK",   StringComparison.OrdinalIgnoreCase)) return "Low-Stock Replenishment";
        if (objective.Contains("ANOMALY",     StringComparison.OrdinalIgnoreCase)) return "Anomaly Investigation";
        if (objective.Contains("OPTIMIZ",     StringComparison.OrdinalIgnoreCase)) return "Inventory Optimization";
        if (objective.Contains("EMERGENCY",   StringComparison.OrdinalIgnoreCase)) return "Emergency Shortage";
        return "General";
    }
}
