using RestaurantInventory.API.DTOs.AI;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IGuidedWorkflowService
{
    Task<List<GuidedWorkflowDefinitionDto>> GetAvailableDefinitionsAsync(string userRole);

    Task<GuidedWorkflowResponse> StartWorkflowAsync(
        StartGuidedWorkflowRequest req,
        Guid userId,
        string userRole);

    Task<GuidedWorkflowResponse> CompleteStepAsync(
        Guid workflowId,
        CompleteGuidedStepRequest req,
        Guid userId);

    Task<GuidedWorkflowResponse> CancelWorkflowAsync(
        Guid workflowId,
        CancelGuidedWorkflowRequest req,
        Guid userId);

    Task<GuidedWorkflowResponse> GetWorkflowByIdAsync(
        Guid workflowId,
        Guid userId);

    Task<List<GuidedWorkflowSummaryDto>> GetUserWorkflowsAsync(
        Guid userId);
}
