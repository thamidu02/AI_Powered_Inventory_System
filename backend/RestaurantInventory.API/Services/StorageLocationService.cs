using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Models.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class StorageLocationService : IStorageLocationService
{
    private readonly ApplicationDbContext _context;

    public StorageLocationService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<StorageLocationResponse>> GetAllAsync()
    {
        return await _context.StorageLocations
            .OrderBy(s => s.Name)
            .Select(s => MapToResponse(s))
            .ToListAsync();
    }

    public async Task<StorageLocationResponse?> GetByIdAsync(Guid id)
    {
        var location = await _context.StorageLocations
            .FirstOrDefaultAsync(s => s.Id == id);

        return location == null
            ? null
            : MapToResponse(location);
    }

    public async Task<StorageLocationResponse> CreateAsync(
        CreateStorageLocationRequest request)
    {
        var name = request.Name.Trim();

        var exists = await _context.StorageLocations
            .AnyAsync(s => s.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException(
                "A storage location with this name already exists.");
        }

        var location = new StorageLocation
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim(),
            TemperatureType = string.IsNullOrWhiteSpace(request.TemperatureType)
                ? null
                : request.TemperatureType.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.StorageLocations.Add(location);
        await _context.SaveChangesAsync();

        return MapToResponse(location);
    }

    public async Task<StorageLocationResponse?> UpdateAsync(
        Guid id,
        UpdateStorageLocationRequest request)
    {
        var location = await _context.StorageLocations
            .FirstOrDefaultAsync(s => s.Id == id);

        if (location == null)
        {
            return null;
        }

        var name = request.Name.Trim();

        var exists = await _context.StorageLocations
            .AnyAsync(s =>
                s.Id != id &&
                s.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException(
                "A storage location with this name already exists.");
        }

        location.Name = name;
        location.Description =
            string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim();

        location.TemperatureType =
            string.IsNullOrWhiteSpace(request.TemperatureType)
                ? null
                : request.TemperatureType.Trim();

        location.IsActive = request.IsActive;
        location.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return MapToResponse(location);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var location = await _context.StorageLocations
            .FirstOrDefaultAsync(s => s.Id == id);

        if (location == null)
        {
            return false;
        }

        location.IsActive = false;
        location.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return true;
    }

    private static StorageLocationResponse MapToResponse(
        StorageLocation location)
    {
        return new StorageLocationResponse
        {
            Id = location.Id,
            Name = location.Name,
            Description = location.Description,
            TemperatureType = location.TemperatureType,
            IsActive = location.IsActive
        };
    }
}