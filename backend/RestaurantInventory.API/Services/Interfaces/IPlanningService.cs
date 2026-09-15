using RestaurantInventory.API.Models.Planning;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IPlanningService
{
    /// <summary>
    /// Generates (or updates) demand plans for all ingredients in the given period.
    /// Uses a per-day average consumption to normalise across different period lengths.
    /// Upserts records so repeated calls do not create duplicates.
    /// </summary>
    Task<IReadOnlyList<DemandPlan>> GenerateDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd);
}
