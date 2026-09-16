using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.AI;
using RestaurantInventory.API.Models.AI;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class GuidedWorkflowService : IGuidedWorkflowService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<GuidedWorkflowService> _logger;

    private static readonly HashSet<string> AllowedRoutes = new(StringComparer.OrdinalIgnoreCase)
    {
        "/inventory",
        "/operations",
        "/master-data",
        "/recipes",
        "/sales-waste",
        "/procurement",
        "/kitchen-orders",
        "/planning",
        "/ai-assistant"
    };

    private static readonly HashSet<string> AllowedTargets = new(StringComparer.OrdinalIgnoreCase)
    {
        "nav-inventory",
        "nav-operations",
        "nav-master-data",
        "nav-recipes",
        "nav-sales-waste",
        "nav-procurement",
        "nav-planning",
        "nav-kitchen-orders",
        "nav-ai-assistant",
        "receive-stock-button",
        "consume-stock-button",
        "record-waste-button",
        "low-stock-alert-card",
        "receive-ingredient-select",
        "receive-location-select",
        "receive-batch-input",
        "receive-quantity-input",
        "receive-unit-cost-input",
        "receive-expiry-input",
        "receive-submit-button",
        "consume-ingredient-select",
        "consume-quantity-input",
        "consume-reason-input",
        "consume-submit-button",
        "waste-ingredient-select",
        "waste-quantity-input",
        "waste-reason-input",
        "waste-submit-button"
    };

    private static readonly Dictionary<string, (string Title, string Description, List<string> Roles, List<GuidedStepDto> Steps)> WorkflowDefinitions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["RECEIVE_STOCK"] = (
            "Receive Stock Batch",
            "Guides the user through receiving a new ingredient shipment, entering batch and expiry information, and recording it safely into inventory.",
            new List<string> { "INVENTORY_MANAGER", "RESTAURANT_MANAGER", "SYSTEM_ADMIN" },
            new List<GuidedStepDto>
            {
                new() { StepNumber = 1, Action = "NAVIGATE", Route = "/inventory", Tab = "inventory", Target = "nav-inventory", Instruction = "Open the Stock and Inventory management view.", WaitForUserAction = true, TargetDescription = "Sidebar/Navbar Inventory Tab" },
                new() { StepNumber = 2, Action = "CLICK", Route = "/inventory", Tab = "inventory", Target = "receive-stock-button", Instruction = "Click the 'Receive Stock' button to open the intake dialog.", WaitForUserAction = true, TargetDescription = "Receive Stock Button" },
                new() { StepNumber = 3, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-ingredient-select", Instruction = "Select the ingredient you are receiving from the shipment list.", WaitForUserAction = true, TargetDescription = "Ingredient Selector" },
                new() { StepNumber = 4, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-location-select", Instruction = "Choose the designated storage location (Dry Storage, Walk-in Cooler, or Freezer).", WaitForUserAction = true, TargetDescription = "Storage Location Selector" },
                new() { StepNumber = 5, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-batch-input", Instruction = "Enter the supplier batch number printed on the packaging.", WaitForUserAction = true, TargetDescription = "Batch Number Input" },
                new() { StepNumber = 6, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-quantity-input", Instruction = "Enter the verified received quantity.", WaitForUserAction = true, TargetDescription = "Quantity Input" },
                new() { StepNumber = 7, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-unit-cost-input", Instruction = "Verify or enter the per-unit purchase cost from the invoice.", WaitForUserAction = true, TargetDescription = "Unit Cost Input" },
                new() { StepNumber = 8, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "receive-expiry-input", Instruction = "Select the expiration date indicated by the manufacturer.", WaitForUserAction = true, TargetDescription = "Expiration Date Input" },
                new() { StepNumber = 9, Action = "CONFIRM", Route = "/inventory", Tab = "inventory", Target = "receive-submit-button", Instruction = "Review details and click 'Confirm Stock Intake' to submit the transaction.", WaitForUserAction = true, TargetDescription = "Confirm Intake Button" }
            }
        ),
        ["CONSUME_STOCK"] = (
            "Record Stock Consumption",
            "Guides the user through logging ingredient consumption for daily kitchen preparation.",
            new List<string> { "INVENTORY_MANAGER", "RESTAURANT_MANAGER", "SYSTEM_ADMIN" },
            new List<GuidedStepDto>
            {
                new() { StepNumber = 1, Action = "NAVIGATE", Route = "/inventory", Tab = "inventory", Target = "nav-inventory", Instruction = "Navigate to the Stock and Batches view.", WaitForUserAction = true, TargetDescription = "Inventory Tab" },
                new() { StepNumber = 2, Action = "CLICK", Route = "/inventory", Tab = "inventory", Target = "consume-stock-button", Instruction = "Click the 'Consume Stock' button.", WaitForUserAction = true, TargetDescription = "Consume Stock Button" },
                new() { StepNumber = 3, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "consume-ingredient-select", Instruction = "Select the ingredient used.", WaitForUserAction = true, TargetDescription = "Ingredient Selector" },
                new() { StepNumber = 4, Action = "INPUT", Route = "/inventory", Tab = "inventory", Target = "consume-quantity-input", Instruction = "Enter the quantity consumed.", WaitForUserAction = true, TargetDescription = "Quantity Input" },
                new() { StepNumber = 5, Action = "CONFIRM", Route = "/inventory", Tab = "inventory", Target = "consume-submit-button", Instruction = "Click 'Record Consumption' to deduct stock.", WaitForUserAction = true, TargetDescription = "Submit Button" }
            }
        ),
        ["RECORD_WASTE"] = (
            "Record Food Waste",
            "Guides recording spoiled or damaged stock with reason tracking.",
            new List<string> { "INVENTORY_MANAGER", "RESTAURANT_MANAGER", "SYSTEM_ADMIN" },
            new List<GuidedStepDto>
            {
                new() { StepNumber = 1, Action = "NAVIGATE", Route = "/sales-waste", Tab = "salesWaste", Target = "nav-sales-waste", Instruction = "Navigate to Sales & Waste view.", WaitForUserAction = true, TargetDescription = "Sales & Waste Tab" },
                new() { StepNumber = 2, Action = "CLICK", Route = "/sales-waste", Tab = "salesWaste", Target = "record-waste-button", Instruction = "Click 'Record Waste' button.", WaitForUserAction = true, TargetDescription = "Record Waste Button" },
                new() { StepNumber = 3, Action = "INPUT", Route = "/sales-waste", Tab = "salesWaste", Target = "waste-ingredient-select", Instruction = "Select the wasted ingredient.", WaitForUserAction = true, TargetDescription = "Ingredient Selector" },
                new() { StepNumber = 4, Action = "INPUT", Route = "/sales-waste", Tab = "salesWaste", Target = "waste-quantity-input", Instruction = "Enter the wasted quantity.", WaitForUserAction = true, TargetDescription = "Quantity Input" },
                new() { StepNumber = 5, Action = "CONFIRM", Route = "/sales-waste", Tab = "salesWaste", Target = "waste-submit-button", Instruction = "Confirm waste log.", WaitForUserAction = true, TargetDescription = "Confirm Button" }
            }
        ),
        ["VIEW_LOW_STOCK"] = (
            "Review Low Stock Alerts",
            "Guides the manager to review ingredients falling below safety thresholds.",
            new List<string> { "INVENTORY_MANAGER", "RESTAURANT_MANAGER", "PROCUREMENT_OFFICER", "SYSTEM_ADMIN" },
            new List<GuidedStepDto>
            {
                new() { StepNumber = 1, Action = "NAVIGATE", Route = "/inventory", Tab = "inventory", Target = "nav-inventory", Instruction = "Open the Stock Overview dashboard.", WaitForUserAction = true, TargetDescription = "Inventory Tab" },
                new() { StepNumber = 2, Action = "INSPECT", Route = "/inventory", Tab = "inventory", Target = "low-stock-alert-card", Instruction = "Review items flagged in amber or red with low stock alerts.", WaitForUserAction = true, TargetDescription = "Low Stock Alerts Banner" }
            }
        )
    };

    public GuidedWorkflowService(ApplicationDbContext db, ILogger<GuidedWorkflowService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public Task<List<GuidedWorkflowDefinitionDto>> GetAvailableDefinitionsAsync(string userRole)
    {
        var result = new List<GuidedWorkflowDefinitionDto>();

        foreach (var (type, (title, desc, roles, steps)) in WorkflowDefinitions)
        {
            if (string.IsNullOrEmpty(userRole) || roles.Contains(userRole, StringComparer.OrdinalIgnoreCase) || userRole.Equals("SYSTEM_ADMIN", StringComparison.OrdinalIgnoreCase))
            {
                result.Add(new GuidedWorkflowDefinitionDto
                {
                    WorkflowType = type,
                    Title = title,
                    Description = desc,
                    TotalSteps = steps.Count,
                    AllowedRoles = roles,
                    Steps = steps
                });
            }
        }

        return Task.FromResult(result);
    }

    public async Task<GuidedWorkflowResponse> StartWorkflowAsync(
        StartGuidedWorkflowRequest req,
        Guid userId,
        string userRole)
    {
        if (string.IsNullOrWhiteSpace(req.WorkflowType))
            throw new ArgumentException("WorkflowType is required.");

        var key = req.WorkflowType.Trim().ToUpperInvariant();
        if (!WorkflowDefinitions.TryGetValue(key, out var def))
            throw new ArgumentException($"Unknown workflow type: {req.WorkflowType}");

        // Role check
        if (!def.Roles.Contains(userRole, StringComparer.OrdinalIgnoreCase) &&
            !userRole.Equals("SYSTEM_ADMIN", StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException($"Role '{userRole}' is not authorized to execute workflow '{key}'.");
        }

        // Determine steps: use provided steps or fallback to template
        var stepsToUse = req.Steps != null && req.Steps.Count > 0 ? req.Steps : def.Steps;

        // Validate each step
        for (int i = 0; i < stepsToUse.Count; i++)
        {
            var s = stepsToUse[i];
            s.StepNumber = i + 1;

            if (!AllowedRoutes.Contains(s.Route))
                throw new ArgumentException($"Security validation failed: Route '{s.Route}' is not in the allowed registry.");

            if (!AllowedTargets.Contains(s.Target))
                throw new ArgumentException($"Security validation failed: Target '{s.Target}' is not in the allowed registry.");
        }

        var workflow = new AIWorkflow
        {
            Objective = $"GUIDED_WORKFLOW:{key}",
            Status = "IN_PROGRESS",
            StartedById = userId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.AIWorkflows.Add(workflow);

        for (int i = 0; i < stepsToUse.Count; i++)
        {
            var step = stepsToUse[i];
            var payload = new
            {
                route = step.Route,
                tab = step.Tab,
                target = step.Target,
                instruction = step.Instruction,
                waitForUserAction = step.WaitForUserAction,
                targetDescription = step.TargetDescription
            };

            var stepEntity = new AIWorkflowStep
            {
                WorkflowId = workflow.Id,
                StepNumber = step.StepNumber,
                AgentName = "GuidedWorkflowEngine",
                Action = step.Action,
                Status = i == 0 ? "IN_PROGRESS" : "PENDING",
                InputJson = JsonSerializer.Serialize(payload),
                StartedAt = i == 0 ? DateTime.UtcNow : null,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.AIWorkflowSteps.Add(stepEntity);
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation("Guided workflow {WorkflowId} ({WorkflowType}) started by user {UserId}",
            workflow.Id, key, userId);

        return BuildResponse(workflow, stepsToUse, 1);
    }

    public async Task<GuidedWorkflowResponse> CompleteStepAsync(
        Guid workflowId,
        CompleteGuidedStepRequest req,
        Guid userId)
    {
        var workflow = await _db.AIWorkflows
            .Include(w => w.Steps)
            .FirstOrDefaultAsync(w => w.Id == workflowId)
            ?? throw new KeyNotFoundException($"Workflow {workflowId} not found.");

        if (workflow.StartedById != userId)
            throw new UnauthorizedAccessException("Cannot complete step for a workflow owned by another user.");

        if (workflow.Status != "IN_PROGRESS")
            throw new InvalidOperationException($"Workflow is not in progress (current status: {workflow.Status}).");

        var orderedSteps = workflow.Steps.OrderBy(s => s.StepNumber).ToList();
        var currentStep = orderedSteps.FirstOrDefault(s => s.StepNumber == req.StepNumber)
            ?? throw new ArgumentException($"Step {req.StepNumber} not found in workflow {workflowId}.");

        currentStep.Status = "COMPLETED";
        currentStep.CompletedAt = DateTime.UtcNow;
        currentStep.OutputJson = req.ResultData ?? "{}";
        currentStep.UpdatedAt = DateTime.UtcNow;

        int nextStepNumber = req.StepNumber + 1;
        var nextStep = orderedSteps.FirstOrDefault(s => s.StepNumber == nextStepNumber);

        if (nextStep != null)
        {
            nextStep.Status = "IN_PROGRESS";
            nextStep.StartedAt = DateTime.UtcNow;
            nextStep.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            // All steps completed
            workflow.Status = "COMPLETED";
            workflow.CompletedAt = DateTime.UtcNow;
            workflow.FinalOutcome = "Successfully completed all guided workflow steps.";
            workflow.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        var dtoList = MapToDto(orderedSteps);
        return BuildResponse(workflow, dtoList, nextStep != null ? nextStepNumber : orderedSteps.Count);
    }

    public async Task<GuidedWorkflowResponse> CancelWorkflowAsync(
        Guid workflowId,
        CancelGuidedWorkflowRequest req,
        Guid userId)
    {
        var workflow = await _db.AIWorkflows
            .Include(w => w.Steps)
            .FirstOrDefaultAsync(w => w.Id == workflowId)
            ?? throw new KeyNotFoundException($"Workflow {workflowId} not found.");

        if (workflow.StartedById != userId)
            throw new UnauthorizedAccessException("Cannot cancel a workflow owned by another user.");

        workflow.Status = "CANCELLED";
        workflow.CompletedAt = DateTime.UtcNow;
        workflow.ErrorMessage = req.Reason ?? "Cancelled by user";
        workflow.UpdatedAt = DateTime.UtcNow;

        foreach (var s in workflow.Steps.Where(s => s.Status is "PENDING" or "IN_PROGRESS"))
        {
            s.Status = "SKIPPED";
            s.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        var orderedSteps = workflow.Steps.OrderBy(s => s.StepNumber).ToList();
        var dtoList = MapToDto(orderedSteps);
        return BuildResponse(workflow, dtoList, 0);
    }

    public async Task<GuidedWorkflowResponse> GetWorkflowByIdAsync(
        Guid workflowId,
        Guid userId)
    {
        var workflow = await _db.AIWorkflows
            .Include(w => w.Steps)
            .FirstOrDefaultAsync(w => w.Id == workflowId)
            ?? throw new KeyNotFoundException($"Workflow {workflowId} not found.");

        if (workflow.StartedById != userId)
            throw new UnauthorizedAccessException("Access denied.");

        var orderedSteps = workflow.Steps.OrderBy(s => s.StepNumber).ToList();
        var activeStep = orderedSteps.FirstOrDefault(s => s.Status == "IN_PROGRESS")?.StepNumber
            ?? (workflow.Status == "COMPLETED" ? orderedSteps.Count : 1);

        var dtoList = MapToDto(orderedSteps);
        return BuildResponse(workflow, dtoList, activeStep);
    }

    public async Task<List<GuidedWorkflowSummaryDto>> GetUserWorkflowsAsync(Guid userId)
    {
        var list = await _db.AIWorkflows
            .AsNoTracking()
            .Include(w => w.Steps)
            .Where(w => w.StartedById == userId && w.Objective.StartsWith("GUIDED_WORKFLOW:"))
            .OrderByDescending(w => w.CreatedAt)
            .Take(30)
            .ToListAsync();

        return list.Select(w => new GuidedWorkflowSummaryDto
        {
            Id = w.Id,
            WorkflowType = w.Objective.Replace("GUIDED_WORKFLOW:", ""),
            Status = w.Status,
            StartedAt = w.CreatedAt,
            CompletedAt = w.CompletedAt,
            TotalSteps = w.Steps.Count,
            CompletedSteps = w.Steps.Count(s => s.Status == "COMPLETED")
        }).ToList();
    }

    private static List<GuidedStepDto> MapToDto(IEnumerable<AIWorkflowStep> entities)
    {
        var result = new List<GuidedStepDto>();

        foreach (var s in entities)
        {
            string route = "/inventory";
            string tab = "inventory";
            string target = "nav-inventory";
            string instruction = "";
            bool waitForUserAction = true;
            string? targetDescription = null;

            if (!string.IsNullOrEmpty(s.InputJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(s.InputJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("route", out var r)) route = r.GetString() ?? route;
                    if (root.TryGetProperty("tab", out var t)) tab = t.GetString() ?? tab;
                    if (root.TryGetProperty("target", out var tg)) target = tg.GetString() ?? target;
                    if (root.TryGetProperty("instruction", out var inst)) instruction = inst.GetString() ?? instruction;
                    if (root.TryGetProperty("waitForUserAction", out var wf)) waitForUserAction = wf.GetBoolean();
                    if (root.TryGetProperty("targetDescription", out var td)) targetDescription = td.GetString();
                }
                catch
                {
                    // Fallback to defaults
                }
            }

            result.Add(new GuidedStepDto
            {
                StepNumber = s.StepNumber,
                Action = s.Action,
                Route = route,
                Tab = tab,
                Target = target,
                Instruction = instruction,
                Status = s.Status,
                WaitForUserAction = waitForUserAction,
                TargetDescription = targetDescription
            });
        }

        return result;
    }

    private static GuidedWorkflowResponse BuildResponse(
        AIWorkflow workflow,
        List<GuidedStepDto> steps,
        int currentStepNumber)
    {
        var type = workflow.Objective.StartsWith("GUIDED_WORKFLOW:")
            ? workflow.Objective.Substring("GUIDED_WORKFLOW:".Length)
            : workflow.Objective;

        string title = type;
        string desc = "";
        if (WorkflowDefinitions.TryGetValue(type, out var def))
        {
            title = def.Title;
            desc = def.Description;
        }

        return new GuidedWorkflowResponse
        {
            WorkflowId = workflow.Id,
            WorkflowType = type,
            Title = title,
            Description = desc,
            Status = workflow.Status,
            CurrentStepNumber = currentStepNumber,
            TotalSteps = steps.Count,
            StartedAt = workflow.CreatedAt,
            CompletedAt = workflow.CompletedAt,
            Steps = steps
        };
    }
}
