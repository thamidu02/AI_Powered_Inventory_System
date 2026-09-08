using RestaurantInventory.API.Models;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Models.AI;

public class AIApproval : BaseEntity
{
    public Guid WorkflowId { get; set; }

    public Guid RequestedById { get; set; }

    public Guid? ReviewedById { get; set; }

    public string Status { get; set; } = "PENDING";

    public string? Decision { get; set; }

    public string? Comment { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ReviewedAt { get; set; }

    public AIWorkflow Workflow { get; set; } = null!;

    public User RequestedBy { get; set; } = null!;

    public User? ReviewedBy { get; set; }
}