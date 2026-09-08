using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.AI;

public class AIWorkflow : BaseEntity
{
    public string Objective { get; set; } = string.Empty;

    public string Status { get; set; } = "PENDING";

    public Guid StartedById { get; set; }

    public DateTime? CompletedAt { get; set; }

    public string? FinalOutcome { get; set; }

    public string? ErrorMessage { get; set; }

    public User StartedBy { get; set; } = null!;

    public ICollection<AIWorkflowStep> Steps { get; set; }
        = new List<AIWorkflowStep>();

    public ICollection<AIApproval> Approvals { get; set; }
        = new List<AIApproval>();
}