using System.ComponentModel.DataAnnotations;

namespace RestaurantInventory.API.DTOs.AI;

public class StartGuidedWorkflowRequest
{
    [Required]
    public string WorkflowType { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public List<GuidedStepDto> Steps { get; set; } = new();
}

public class GuidedStepDto
{
    public int StepNumber { get; set; }

    [Required]
    public string Action { get; set; } = string.Empty;

    [Required]
    public string Route { get; set; } = string.Empty;

    public string Tab { get; set; } = string.Empty;

    [Required]
    public string Target { get; set; } = string.Empty;

    public string Instruction { get; set; } = string.Empty;

    public string Status { get; set; } = "PENDING"; // PENDING, IN_PROGRESS, COMPLETED, SKIPPED, FAILED

    public bool WaitForUserAction { get; set; } = true;

    public string? TargetDescription { get; set; }
}

public class GuidedWorkflowResponse
{
    public Guid WorkflowId { get; set; }

    public string WorkflowType { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Status { get; set; } = "IN_PROGRESS";

    public int CurrentStepNumber { get; set; } = 1;

    public int TotalSteps { get; set; }

    public DateTime StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public List<GuidedStepDto> Steps { get; set; } = new();
}

public class CompleteGuidedStepRequest
{
    public int StepNumber { get; set; }

    public string? ResultData { get; set; }
}

public class CancelGuidedWorkflowRequest
{
    public string? Reason { get; set; }
}

public class GuidedWorkflowDefinitionDto
{
    public string WorkflowType { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int TotalSteps { get; set; }

    public List<string> AllowedRoles { get; set; } = new();

    public List<GuidedStepDto> Steps { get; set; } = new();
}

public class GuidedWorkflowSummaryDto
{
    public Guid Id { get; set; }

    public string WorkflowType { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public DateTime StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public int TotalSteps { get; set; }

    public int CompletedSteps { get; set; }
}
