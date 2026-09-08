using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Models.Identity;

namespace RestaurantInventory.API.Data;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(
        IServiceProvider services,
        IConfiguration configuration)
    {
        using var scope = services.CreateScope();

        var context = scope.ServiceProvider
            .GetRequiredService<ApplicationDbContext>();

        await context.Database.MigrateAsync();

        await SeedRolesAsync(context);

        await SeedUsersAsync(context, configuration);
    }

    private static async Task SeedRolesAsync(
        ApplicationDbContext context)
    {
        var roles = new[]
        {
            new Role
            {
                Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Name = "SYSTEM_ADMIN",
                Description = "Manages users, roles, configuration and master data."
            },

            new Role
            {
                Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                Name = "RESTAURANT_MANAGER",
                Description = "Main managerial decision maker."
            },

            new Role
            {
                Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                Name = "INVENTORY_MANAGER",
                Description = "Manages stock and inventory operations."
            },

            new Role
            {
                Id = Guid.Parse("44444444-4444-4444-4444-444444444444"),
                Name = "PROCUREMENT_OFFICER",
                Description = "Manages suppliers and procurement."
            },

            new Role
            {
                Id = Guid.Parse("55555555-5555-5555-5555-555555555555"),
                Name = "SALES_KITCHEN_STAFF",
                Description = "Records sales, consumption and waste."
            }
        };

        foreach (var role in roles)
        {
            var exists = await context.Roles
                .AnyAsync(r => r.Id == role.Id);

            if (!exists)
            {
                context.Roles.Add(role);
            }
        }

        await context.SaveChangesAsync();
    }

    private static async Task SeedUsersAsync(
        ApplicationDbContext context,
        IConfiguration configuration)
    {
        var password = configuration["SeedUsers:DefaultPassword"];

        if (string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var passwordHasher = new PasswordHasher<User>();

        var users = new[]
        {
            new
            {
                Email = "admin@restaurant.com",
                FirstName = "System",
                LastName = "Admin",
                RoleId = Guid.Parse("11111111-1111-1111-1111-111111111111")
            },

            new
            {
                Email = "manager@restaurant.com",
                FirstName = "Restaurant",
                LastName = "Manager",
                RoleId = Guid.Parse("22222222-2222-2222-2222-222222222222")
            },

            new
            {
                Email = "inventory@restaurant.com",
                FirstName = "Inventory",
                LastName = "Manager",
                RoleId = Guid.Parse("33333333-3333-3333-3333-333333333333")
            },

            new
            {
                Email = "procurement@restaurant.com",
                FirstName = "Procurement",
                LastName = "Officer",
                RoleId = Guid.Parse("44444444-4444-4444-4444-444444444444")
            },

            new
            {
                Email = "staff@restaurant.com",
                FirstName = "Sales",
                LastName = "Staff",
                RoleId = Guid.Parse("55555555-5555-5555-5555-555555555555")
            }
        };

        foreach (var seedUser in users)
        {
            var exists = await context.Users
                .AnyAsync(u => u.Email == seedUser.Email);

            if (exists)
            {
                continue;
            }

            var user = new User
            {
                Id = Guid.NewGuid(),
                RoleId = seedUser.RoleId,
                FirstName = seedUser.FirstName,
                LastName = seedUser.LastName,
                Email = seedUser.Email,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            user.PasswordHash = passwordHasher.HashPassword(
                user,
                password);

            context.Users.Add(user);
        }

        await context.SaveChangesAsync();
    }
}