using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.Inventory;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class InventoryController : ControllerBase
{
    private readonly IInventoryService _inventoryService;

    public InventoryController(IInventoryService inventoryService)
    {
        _inventoryService = inventoryService;
    }

    // ============================================================
    // GET ALL INVENTORY
    // ============================================================

    [HttpGet]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetInventory()
    {
        var result = await _inventoryService.GetInventoryAsync();

        return Ok(result);
    }


    // ============================================================
    // GET INVENTORY BY INGREDIENT
    // ============================================================

    [HttpGet("{ingredientId:guid}")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetInventoryByIngredient(
        Guid ingredientId)
    {
        var result =
            await _inventoryService.GetInventoryByIngredientAsync(
                ingredientId);

        if (result == null)
            return NotFound(new
            {
                message = "Ingredient not found."
            });

        return Ok(result);
    }


    // ============================================================
    // LOW STOCK
    // ============================================================

    [HttpGet("low-stock")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER")]
    public async Task<IActionResult> GetLowStock()
    {
        var result = await _inventoryService.GetLowStockAsync();

        return Ok(result);
    }


    // ============================================================
    // EXPIRING STOCK
    // ============================================================

    [HttpGet("expiring")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetExpiringStock(
        [FromQuery] int days = 7)
    {
        if (days < 0)
        {
            return BadRequest(new
            {
                message = "Days cannot be negative."
            });
        }

        var result =
            await _inventoryService.GetExpiringStockAsync(days);

        return Ok(result);
    }


    // ============================================================
    // RECEIVE STOCK
    // ============================================================

    [HttpPost("receive")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER,RESTAURANT_MANAGER")]
    public async Task<IActionResult> ReceiveStock(
        [FromBody] ReceiveStockRequest request)
    {
        var userId = GetCurrentUserId();

        await _inventoryService.ReceiveStockAsync(
            request,
            userId);

        return Ok(new
        {
            message = "Stock received successfully."
        });
    }


    // ============================================================
    // CONSUME STOCK
    // ============================================================

    [HttpPost("consume")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER,SALES_KITCHEN_STAFF,RESTAURANT_MANAGER")]
    public async Task<IActionResult> ConsumeStock(
        [FromBody] ConsumeStockRequest request)
    {
        var userId = GetCurrentUserId();

        await _inventoryService.ConsumeStockAsync(
            request,
            userId);

        return Ok(new
        {
            message = "Stock consumed successfully."
        });
    }


    // ============================================================
    // RECORD WASTE
    // ============================================================

    [HttpPost("waste")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER,SALES_KITCHEN_STAFF,RESTAURANT_MANAGER")]
    public async Task<IActionResult> RecordWaste(
        [FromBody] RecordWasteRequest request)
    {
        var userId = GetCurrentUserId();

        await _inventoryService.RecordWasteAsync(
            request,
            userId);

        return Ok(new
        {
            message = "Waste recorded successfully."
        });
    }


    // ============================================================
    // ADJUST STOCK
    // ============================================================

    [HttpPost("adjust")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER,RESTAURANT_MANAGER")]
    public async Task<IActionResult> AdjustStock(
        [FromBody] AdjustStockRequest request)
    {
        var userId = GetCurrentUserId();

        var adjustmentId = await _inventoryService.AdjustStockAsync(
            request,
            userId);

        return Ok(new
        {
            message = "Stock adjustment submitted successfully.",
            adjustmentId
        });
    }


    // ============================================================
    // GET ADJUSTMENTS
    // ============================================================

    [HttpGet("adjustments")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER")]
    public async Task<IActionResult> GetAdjustments(
        [FromQuery] string? status = null)
    {
        var result = await _inventoryService.GetAdjustmentsAsync(status);

        return Ok(result);
    }


    // ============================================================
    // APPROVE ADJUSTMENT
    // ============================================================

    [HttpPost("adjustments/{adjustmentId:guid}/approve")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER")]
    public async Task<IActionResult> ApproveAdjustment(
        Guid adjustmentId)
    {
        var managerId = GetCurrentUserId();

        await _inventoryService.ApproveAdjustmentAsync(
            adjustmentId,
            managerId);

        return Ok(new
        {
            message = "Stock adjustment approved and applied."
        });
    }


    // ============================================================
    // REJECT ADJUSTMENT
    // ============================================================

    [HttpPost("adjustments/{adjustmentId:guid}/reject")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER")]
    public async Task<IActionResult> RejectAdjustment(
        Guid adjustmentId)
    {
        var managerId = GetCurrentUserId();

        await _inventoryService.RejectAdjustmentAsync(
            adjustmentId,
            managerId);

        return Ok(new
        {
            message = "Stock adjustment rejected."
        });
    }


    // ============================================================
    // TRANSFER STOCK
    // ============================================================

    [HttpPost("transfer")]
    [Authorize(Roles = "SYSTEM_ADMIN,INVENTORY_MANAGER,RESTAURANT_MANAGER")]
    public async Task<IActionResult> TransferStock(
        [FromBody] TransferStockRequest request)
    {
        var userId = GetCurrentUserId();

        await _inventoryService.TransferStockAsync(
            request,
            userId);

        return Ok(new
        {
            message = "Stock transferred successfully."
        });
    }


    // ============================================================
    // STOCK MOVEMENTS & CONSUME HISTORY
    // ============================================================

    [HttpGet("movements")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetStockMovements(
        [FromQuery] Guid? ingredientId = null,
        [FromQuery] Guid? batchId = null,
        [FromQuery] string? movementType = null)
    {
        var result = await _inventoryService.GetStockMovementsAsync(
            ingredientId,
            batchId,
            movementType);

        return Ok(result);
    }

    [HttpGet("batches/{batchId:guid}/history")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetBatchHistory(
        Guid batchId,
        [FromQuery] string? movementType = null)
    {
        var result = await _inventoryService.GetBatchMovementsAsync(
            batchId,
            movementType);

        return Ok(result);
    }

    [HttpGet("ingredients/{ingredientId:guid}/history")]
    [Authorize(Roles = "SYSTEM_ADMIN,RESTAURANT_MANAGER,INVENTORY_MANAGER,PROCUREMENT_OFFICER,SALES_KITCHEN_STAFF")]
    public async Task<IActionResult> GetIngredientHistory(
        Guid ingredientId,
        [FromQuery] string? movementType = null)
    {
        var result = await _inventoryService.GetIngredientMovementsAsync(
            ingredientId,
            movementType);

        return Ok(result);
    }


    // ============================================================
    // CURRENT USER
    // ============================================================

    private Guid GetCurrentUserId()
    {
        var userId = User.FindFirstValue(
            ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(userId, out var parsedUserId))
        {
            throw new UnauthorizedAccessException(
                "Invalid user identity.");
        }

        return parsedUserId;
    }
}