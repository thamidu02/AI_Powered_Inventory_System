using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

// OpenAPI
builder.Services.AddOpenApi();

// PostgreSQL / Supabase
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")
    ));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.Run();