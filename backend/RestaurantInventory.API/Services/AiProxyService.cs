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

        HttpResponseMessage response;
        string? upstreamError = null;
        try
        {
            response = await _http.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                ct);
            response.EnsureSuccessStatusCode();
        }
        catch (HttpRequestException ex)
        {
            upstreamError = JsonSerializer.Serialize(new
            {
                type = "message",
                text = $"AI service is unavailable at {_aiServiceUrl}. Start the AI service and try again. Details: {ex.Message}"
            });
            response = null!;
        }

        if (upstreamError != null)
        {
            yield return $"data: {upstreamError}\n\n";
            yield return "data: {\"type\":\"done\"}\n\n";
            yield break;
        }

        using (response)
        {
            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? line;
            while ((line = await reader.ReadLineAsync(ct)) != null && !ct.IsCancellationRequested)
            {
                await PersistWorkflowEventAsync(line, userId);
                // Forward raw SSE lines (including blank lines) to the caller
                yield return line + "\n";
            }
        }
    }

    /// <summary>
    /// Persists the durable workflow audit trail from the AI service's
    /// structured SSE events. Failures are isolated from chat streaming so an
    /// unavailable database cannot turn a safe, read-only report into a write.
    /// </summary>
    private async Task PersistWorkflowEventAsync(string line, string userId)
    {
        if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
            !Guid.TryParse(userId, out var startedById))
            return;

        try
        {
            using var document = JsonDocument.Parse(line[5..].Trim());
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var typeElement))
                return;

            var type = typeElement.GetString();
            if (!root.TryGetProperty("workflow_id", out var idElement) ||
                !Guid.TryParse(idElement.GetString(), out var workflowId))
                return;

            var workflow = await _db.AIWorkflows
                .Include(w => w.Steps)
                .Include(w => w.Approvals)
                .FirstOrDefaultAsync(w => w.Id == workflowId);

            if (type == "intent" && workflow == null)
            {
                var workflowType = root.TryGetProperty("intent", out var intent)
                    ? intent.GetString() ?? "GENERAL"
                    : "GENERAL";
                workflow = new AIWorkflow
                {
                    Id = workflowId,
                    StartedById = startedById,
                    Objective = workflowType,
                    Status = "RUNNING"
                };
                _db.AIWorkflows.Add(workflow);
            }

            if (workflow == null)
                return;

            if (type == "stage_output")
            {
                if (!TryValidateComponent3Stage(root, out var validationError))
                {
                    workflow.Status = "FAILED";
                    workflow.ErrorMessage = validationError;
                    workflow.CompletedAt = DateTime.UtcNow;
                    await _db.SaveChangesAsync();
                    return;
                }

                var stage = root.GetProperty("stage").GetString()!;
                var role = root.GetProperty("role").GetString()!;
                if (stage == "recommendation" &&
                    !TryValidateRecommendation(root.GetProperty("output"), out validationError))
                {
                    workflow.Status = "FAILED";
                    workflow.ErrorMessage = validationError;
                    workflow.CompletedAt = DateTime.UtcNow;
                    await _db.SaveChangesAsync();
                    return;
                }
                workflow.Steps.Add(new AIWorkflowStep
                {
                    WorkflowId = workflowId,
                    StepNumber = workflow.Steps.Count == 0
                        ? 1 : workflow.Steps.Max(s => s.StepNumber) + 1,
                    AgentName = role,
                    Action = $"{stage}_stage_output",
                    Status = "COMPLETED",
                    OutputJson = root.GetProperty("output").GetRawText(),
                    StartedAt = DateTime.UtcNow,
                    CompletedAt = DateTime.UtcNow
                });
            }
            else if (type == "tool_call")
            {
                // A model response can contain several calls with the same
                // model step number; the database sequence is per tool call.
                var stepNumber = workflow.Steps.Count == 0
                    ? 1
                    : workflow.Steps.Max(s => s.StepNumber) + 1;
                var input = root.TryGetProperty("input", out var inputValue)
                    ? inputValue.GetRawText() : null;
                workflow.Steps.Add(new AIWorkflowStep
                {
                    WorkflowId = workflowId,
                    StepNumber = stepNumber,
                    AgentName = "Component3Agent",
                    Action = root.TryGetProperty("tool", out var tool)
                        ? tool.GetString() ?? "tool" : "tool",
                    Status = "RUNNING",
                    InputJson = input,
                    StartedAt = DateTime.UtcNow
                });
            }
            else if (type == "tool_result")
            {
                var toolName = root.TryGetProperty("tool", out var tool)
                    ? tool.GetString() : null;
                var existing = workflow.Steps
                    .Where(s => s.Status == "RUNNING" &&
                                (toolName == null || s.Action == toolName))
                    .OrderByDescending(s => s.StepNumber)
                    .FirstOrDefault();
                if (existing != null)
                {
                    existing.Status = "COMPLETED";
                    existing.OutputJson = root.TryGetProperty("output", out var output)
                        ? output.GetRawText() : null;
                    existing.CompletedAt = DateTime.UtcNow;
                }
            }

            else if (type == "approval_required")
            {
                workflow.Status = "AWAITING_APPROVAL";
                if (!workflow.Approvals.Any(a => a.Status == "PENDING"))
                {
                    workflow.Approvals.Add(new AIApproval
                    {
                        WorkflowId = workflowId,
                        RequestedById = startedById,
                        Status = "PENDING",
                        RequestedAt = DateTime.UtcNow
                    });
                }
            }
            else if (type == "message")
            {
                workflow.FinalOutcome = root.TryGetProperty("text", out var text)
                    ? text.GetString() : null;
            }
            else if (type == "done" && workflow.Status != "AWAITING_APPROVAL")
            {
                var requiredStages = new[]
                    { "sales_stage_output", "consumption_stage_output",
                      "waste_stage_output", "recommendation_stage_output" };
                var completeStages = workflow.Steps
                    .Where(s => s.Status == "COMPLETED")
                    .Select(s => s.Action)
                    .ToHashSet(StringComparer.Ordinal);
                if (workflow.Objective.Contains("SALES_CONSUMPTION_WASTE",
                        StringComparison.OrdinalIgnoreCase) &&
                    !requiredStages.All(completeStages.Contains))
                {
                    workflow.Status = "FAILED";
                    workflow.ErrorMessage = "Component 3 workflow completed without all four required stages.";
                }
                else
                {
                    workflow.Status = "COMPLETED";
                }
                workflow.CompletedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
        }
        catch (JsonException)
        {
            // Ignore non-JSON SSE lines.
        }
        catch (DbUpdateException)
        {
            // AI output must fail safe; audit persistence is best effort.
            _db.ChangeTracker.Clear();
        }
    }

    private static bool TryValidateComponent3Stage(JsonElement root, out string error)
    {
        error = string.Empty;
        var roles = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["sales"] = "SalesAgent", ["consumption"] = "ConsumptionAgent",
            ["waste"] = "WasteAgent", ["recommendation"] = "RecommendationAgent"
        };
        if (!root.TryGetProperty("stage", out var stage) ||
            !root.TryGetProperty("role", out var role) ||
            !root.TryGetProperty("output", out var output) ||
            stage.ValueKind != JsonValueKind.String ||
            role.ValueKind != JsonValueKind.String ||
            output.ValueKind != JsonValueKind.Object)
        {
            error = "Component 3 stage output must contain stage, role and object output.";
            return false;
        }
        var stageName = stage.GetString()!;
        if (!roles.TryGetValue(stageName, out var expectedRole) ||
            role.GetString() != expectedRole ||
            !output.TryGetProperty("read_only", out var readOnly) ||
            readOnly.ValueKind != JsonValueKind.True ||
            !output.TryGetProperty("tool", out var tool) ||
            tool.ValueKind != JsonValueKind.String ||
            !output.TryGetProperty("data", out var data) ||
            data.ValueKind != JsonValueKind.Object)
        {
            error = "Component 3 stage output failed its structured read-only contract.";
            return false;
        }
        var allowed = stageName switch
        {
            "sales" => new[] { "get_sales_summary", "get_sales_records" },
            "consumption" => new[] { "get_consumption_movements", "get_recipes",
                "get_all_stock_levels", "get_ingredient_stock", "get_stock_movements" },
            "waste" => new[] { "get_component3_waste_summary" },
            _ => new[] { "build_component3_report" }
        };
        if (!allowed.Contains(tool.GetString(), StringComparer.Ordinal))
        {
            error = "Tool is not allowed for the Component 3 stage.";
            return false;
        }
        return true;
    }

    private static bool TryValidateRecommendation(JsonElement output, out string error)
    {
        error = string.Empty;
        if (!output.TryGetProperty("recommendations", out var recommendations) ||
            recommendations.ValueKind != JsonValueKind.Array ||
            !output.TryGetProperty("impact_level", out var impact) ||
            impact.ValueKind != JsonValueKind.String ||
            !new[] { "LOW", "MEDIUM", "HIGH" }.Contains(impact.GetString()) ||
            !output.TryGetProperty("confidence", out var confidence) ||
            confidence.ValueKind != JsonValueKind.Number ||
            confidence.GetDouble() is < 0 or > 1 ||
            !output.TryGetProperty("requires_approval", out var approval) ||
            (approval.ValueKind != JsonValueKind.True && approval.ValueKind != JsonValueKind.False))
        {
            error = "Recommendation output is missing structured impact, confidence, or approval fields.";
            return false;
        }
        if (output.TryGetProperty("data", out var data) &&
            data.TryGetProperty("requires_approval", out var dataApproval) &&
            dataApproval.ValueKind == JsonValueKind.True &&
            approval.ValueKind != JsonValueKind.True)
        {
            error = "Recommendation approval flags are inconsistent.";
            return false;
        }
        return true;
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

        decision = decision.Trim().ToUpperInvariant();
        if (decision is not ("APPROVED" or "REJECTED"))
            throw new ArgumentException("Decision must be APPROVED or REJECTED.");

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
