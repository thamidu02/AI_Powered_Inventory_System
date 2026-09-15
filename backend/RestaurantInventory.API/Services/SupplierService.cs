using Microsoft.EntityFrameworkCore;
using RestaurantInventory.API.Data;
using RestaurantInventory.API.DTOs.Procurement;
using RestaurantInventory.API.Models.Procurement;
using RestaurantInventory.API.Services.Interfaces;

namespace RestaurantInventory.API.Services;

public class SupplierService : ISupplierService
{
    private readonly ApplicationDbContext _context;

    public SupplierService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<List<SupplierResponse>> GetAllAsync()
    {
        return await _context.Suppliers
            .AsNoTracking()
            .OrderBy(s => s.Name)
            .Select(s => MapToResponse(s))
            .ToListAsync();
    }

    public async Task<SupplierResponse?> GetByIdAsync(Guid id)
    {
        var supplier = await _context.Suppliers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id);

        return supplier == null ? null : MapToResponse(supplier);
    }

    public async Task<SupplierResponse> CreateAsync(CreateSupplierRequest request)
    {
        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("Supplier name is required.");
        }

        var exists = await _context.Suppliers
            .AnyAsync(s => s.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException("A supplier with this name already exists.");
        }

        var supplier = new Supplier
        {
            Id = Guid.NewGuid(),
            Name = name,
            ContactPerson = string.IsNullOrWhiteSpace(request.ContactPerson) ? null : request.ContactPerson.Trim(),
            Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim(),
            PaymentTerms = string.IsNullOrWhiteSpace(request.PaymentTerms) ? null : request.PaymentTerms.Trim(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.Suppliers.Add(supplier);
        await _context.SaveChangesAsync();

        return MapToResponse(supplier);
    }

    public async Task<SupplierResponse?> UpdateAsync(Guid id, UpdateSupplierRequest request)
    {
        var supplier = await _context.Suppliers
            .FirstOrDefaultAsync(s => s.Id == id);

        if (supplier == null)
        {
            return null;
        }

        var name = request.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("Supplier name is required.");
        }

        var exists = await _context.Suppliers
            .AnyAsync(s => s.Id != id && s.Name.ToLower() == name.ToLower());

        if (exists)
        {
            throw new InvalidOperationException("A supplier with this name already exists.");
        }

        supplier.Name = name;
        supplier.ContactPerson = string.IsNullOrWhiteSpace(request.ContactPerson) ? null : request.ContactPerson.Trim();
        supplier.Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        supplier.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        supplier.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
        supplier.PaymentTerms = string.IsNullOrWhiteSpace(request.PaymentTerms) ? null : request.PaymentTerms.Trim();
        supplier.IsActive = request.IsActive;
        supplier.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return MapToResponse(supplier);
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var supplier = await _context.Suppliers
            .FirstOrDefaultAsync(s => s.Id == id);

        if (supplier == null)
        {
            return false;
        }

        var hasPurchaseOrders = await _context.PurchaseOrders
            .AnyAsync(po => po.SupplierId == id);

        if (hasPurchaseOrders)
        {
            throw new InvalidOperationException(
                $"Cannot delete supplier '{supplier.Name}'. It is referenced by existing purchase order records. Please deactivate the supplier instead.");
        }

        var hasPurchaseRequestItems = await _context.PurchaseRequestItems
            .AnyAsync(pri => pri.SuggestedSupplierId == id);

        if (hasPurchaseRequestItems)
        {
            throw new InvalidOperationException(
                $"Cannot delete supplier '{supplier.Name}'. It is referenced by purchase request items. Please deactivate the supplier instead.");
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            // Remove associated supplier-ingredient mapping if any
            var supplierIngredients = await _context.SupplierIngredients
                .Where(si => si.SupplierId == id)
                .ToListAsync();

            if (supplierIngredients.Count != 0)
            {
                _context.SupplierIngredients.RemoveRange(supplierIngredients);
            }

            _context.Suppliers.Remove(supplier);
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            return true;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static SupplierResponse MapToResponse(Supplier supplier)
    {
        return new SupplierResponse
        {
            Id = supplier.Id,
            Name = supplier.Name,
            ContactPerson = supplier.ContactPerson,
            Email = supplier.Email,
            Phone = supplier.Phone,
            Address = supplier.Address,
            PaymentTerms = supplier.PaymentTerms,
            IsActive = supplier.IsActive,
            CreatedAt = supplier.CreatedAt,
            UpdatedAt = supplier.UpdatedAt
        };
    }
}
