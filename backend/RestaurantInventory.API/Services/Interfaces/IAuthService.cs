using RestaurantInventory.API.DTOs.Auth;

namespace RestaurantInventory.API.Services.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
}