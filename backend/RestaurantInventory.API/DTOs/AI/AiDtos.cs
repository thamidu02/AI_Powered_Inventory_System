namespace RestaurantInventory.API.DTOs.AI;

// ─── Chat ────────────────────────────────────────────────────────────────────

public class AiChatRequest
{
    public string Message { get; set; } = string.Empty;

    /// <summary>Optional — continues an existing workflow conversation.</summary>
    public string? WorkflowId { get; set; }
}

// ─── Workflow list ────────────────────────────────────────────────────────────

public class AiWorkflowSummary
{
    public string Id          { get; set; } = string.Empty;
    public string WorkflowType { get; set; } = string.Empty;
    public string Status      { get; set; } = string.Empty;
    public string Objective   { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? FinalOutcome { get; set; }
    public int StepCount      { get; set; }
}

// ─── Approval ────────────────────────────────────────────────────────────────

public class AiApprovalRequest
{
    public string Decision { get; set; } = string.Empty;  // APPROVED | REJECTED
    public string? Comment { get; set; }
}

public class AiSalesWasteAnalyzeRequest
{
    public int Days { get; set; } = 30;
}
