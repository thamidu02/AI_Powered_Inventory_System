using RestaurantInventory.API.DTOs.Planning;
using RestaurantInventory.API.Models.Planning;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IPlanningService
{
    /// <summary>
    /// Generates (or updates) demand plans for all ingredients in the given period.
    /// Uses weekday/weekend average consumption and upserts records.
    /// </summary>
    Task<IReadOnlyList<DemandPlan>> GenerateDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd);

    /// <summary>
    /// Generates inventory-aware demand plans with shortage, stock coverage, and reorder recommendations.
    /// </summary>
    Task<IReadOnlyList<DemandPlanResponse>> GetDetailedDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd);

    /// <summary>
    /// Retrieves reorder recommendations for items needing replenishment based on min/max stock rules.
    /// </summary>
    Task<IReadOnlyList<PlanningRecommendationResponse>> GetRecommendationsAsync(
        DateTime periodStart,
        DateTime periodEnd);

    /// <summary>
    /// Computes risk metrics (stock-out risks, high demand, overstock) for planning decisions.
    /// </summary>
    Task<PlanningRiskSummaryResponse> GetRiskAnalyticsAsync(
        DateTime periodStart,
        DateTime periodEnd);
}
