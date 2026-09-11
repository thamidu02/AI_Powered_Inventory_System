using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.Security;
using RestaurantInventory.API.Services;
using RestaurantInventory.API.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// --------------------------------------------------
// Controllers
// --------------------------------------------------

builder.Services.AddControllers();

// --------------------------------------------------
// CORS
// --------------------------------------------------

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
        policy
            .WithOrigins(
                "http://localhost:5173",   // Vite dev server
                "http://localhost:3000",   // Alternative dev port
                "https://localhost:5173"
            )
            .AllowAnyHeader()
            .AllowAnyMethod());
});

// --------------------------------------------------
// Database
// --------------------------------------------------

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// --------------------------------------------------
// JWT Settings
// --------------------------------------------------

var jwtSettings = new JwtSettings
{
    SecretKey = builder.Configuration["Jwt:SecretKey"]
        ?? throw new InvalidOperationException(
            "JWT SecretKey is not configured."),

    Issuer = builder.Configuration["Jwt:Issuer"]
        ?? throw new InvalidOperationException(
            "JWT Issuer is not configured."),

    Audience = builder.Configuration["Jwt:Audience"]
        ?? throw new InvalidOperationException(
            "JWT Audience is not configured."),

    ExpirationMinutes =
        builder.Configuration.GetValue<int>("Jwt:ExpirationMinutes")
};

// --------------------------------------------------
// JWT Authentication
// --------------------------------------------------

builder.Services.AddSingleton(jwtSettings);

builder.Services.AddAuthentication(
    JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSettings.Issuer,

            ValidateAudience = true,
            ValidAudience = jwtSettings.Audience,

            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),

            ValidateLifetime = true,

            ClockSkew = TimeSpan.Zero
        };
    });

// --------------------------------------------------
// Authorization
// --------------------------------------------------

builder.Services.AddAuthorization();

// --------------------------------------------------
// Application Services
// --------------------------------------------------

builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddScoped<IIngredientService, IngredientService>();
builder.Services.AddScoped<
    IIngredientCategoryService,
    IngredientCategoryService>();
builder.Services.AddScoped<
    IStorageLocationService,
    StorageLocationService>();
builder.Services.AddScoped<ISalesService, SalesService>();

builder.Services.AddSingleton<JwtTokenService>();

// --------------------------------------------------
// Swagger
// --------------------------------------------------

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.ParameterLocation.Header,
        Description = "Enter: Bearer {your JWT token}"
    });

    options.AddSecurityRequirement(document => new Microsoft.OpenApi.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer", document),
            new List<string>()
        }
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    await DatabaseSeeder.SeedAsync(services, builder.Configuration);
}

// --------------------------------------------------
// HTTP Pipeline
// --------------------------------------------------

// Global exception handler — maps business exceptions to proper HTTP status codes
// so the frontend receives a JSON { message } body instead of HTTP 500 HTML.
app.UseExceptionHandler(errApp =>
{
    errApp.Run(async ctx =>
    {
        var feature = ctx.Features.Get<IExceptionHandlerFeature>();
        var ex = feature?.Error;

        ctx.Response.ContentType = "application/json";
        ctx.Response.StatusCode = ex switch
        {
            InvalidOperationException => StatusCodes.Status400BadRequest,
            ArgumentException        => StatusCodes.Status400BadRequest,
            KeyNotFoundException     => StatusCodes.Status404NotFound,
            UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
            _ => StatusCodes.Status500InternalServerError
        };

        var message = (ctx.Response.StatusCode == 500)
            ? "An unexpected error occurred."
            : ex?.Message ?? "An error occurred.";

        await ctx.Response.WriteAsJsonAsync(new { message });
    });
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("FrontendPolicy");

// IMPORTANT: Authentication must come before Authorization.
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

public partial class Program { }