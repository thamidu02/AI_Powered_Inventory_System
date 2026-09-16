using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RestaurantInventory.API.DTOs.AI;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Controllers;

[ApiController]
[Route("api/ai/guided-workflows")]
[Authorize]
public class GuidedWorkflowsController : ControllerBase
{
    private readonly IGuidedWorkflowService _service;
    private readonly ILogger<GuidedWorkflowsController> _logger;

    public GuidedWorkflowsController(
        IGuidedWorkflowService service,
        ILogger<GuidedWorkflowsController> logger)
    {
        _service = service;
        _logger = logger;
    }

    [HttpGet("definitions")]
    public async Task<IActionResult> GetDefinitions()
    {
        var role = GetCurrentUserRole();
        var definitions = await _service.GetAvailableDefinitionsAsync(role);
        return Ok(definitions);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        var userId = GetCurrentUserId();
        var workflows = await _service.GetUserWorkflowsAsync(userId);
        return Ok(workflows);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = GetCurrentUserId();
        try
        {
            var wf = await _service.GetWorkflowByIdAsync(id, userId);
            return Ok(wf);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] StartGuidedWorkflowRequest req)
    {
        var userId = GetCurrentUserId();
        var role = GetCurrentUserRole();

        try
        {
            var response = await _service.StartWorkflowAsync(req, userId, role);
            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/complete-step")]
    public async Task<IActionResult> CompleteStep(Guid id, [FromBody] CompleteGuidedStepRequest req)
    {
        var userId = GetCurrentUserId();

        try
        {
            var response = await _service.CompleteStepAsync(id, req, userId);
            return Ok(response);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelGuidedWorkflowRequest req)
    {
        var userId = GetCurrentUserId();

        try
        {
            var response = await _service.CancelWorkflowAsync(id, req, userId);
            return Ok(response);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    private Guid GetCurrentUserId()
    {
        var str = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(str) || !Guid.TryParse(str, out var guid))
        {
            throw new UnauthorizedAccessException("Valid user ID claim missing.");
        }
        return guid;
    }

    private string GetCurrentUserRole()
    {
        return User.FindFirstValue(ClaimTypes.Role) ?? "";
    }
}
