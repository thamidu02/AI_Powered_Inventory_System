using RestaurantInventory.API.Models.Planning;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IPlanningService
{
    Task<List<DemandPlan>> GenerateDemandPlansAsync(
        DateTime periodStart,
        DateTime periodEnd);
}