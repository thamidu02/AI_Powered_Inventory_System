using RestaurantInventory.API.Models;

namespace RestaurantInventory.API.Models.AI;

public class AIWorkflowStep : BaseEntity
{
    public Guid WorkflowId { get; set; }

    public int StepNumber { get; set; }

    public string AgentName { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string Status { get; set; } = "PENDING";

    public string? InputJson { get; set; }

    public string? OutputJson { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public string? ErrorMessage { get; set; }

    public int RetryCount { get; set; }

    public AIWorkflow Workflow { get; set; } = null!;
}