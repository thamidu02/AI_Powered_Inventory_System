import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  MapPin,
  Pencil,
  PlusCircle,
  Power,
  PowerOff,
  RefreshCw,
  Tag,
  Thermometer,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  ActiveModal,
  CategoryResponse,
  IngredientResponse,
  InventoryResponse,
  StockBatchResponse,
  StorageLocationResponse,
} from '../types';
import { useAuth } from '../context/useAuth';

interface MasterDataViewProps {
  onSuccess: (msg: string) => void;
  onOpenModal?: (modal: ActiveModal) => void;
}

export const MasterDataView: React.FC<MasterDataViewProps> = ({ onSuccess, onOpenModal }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'ingredients' | 'categories' | 'locations'>('ingredients');

  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [locations, setLocations] = useState<StorageLocationResponse[]>([]);
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Relocation notification modal state
  const [viewingRelocationLocation, setViewingRelocationLocation] = useState<{
    location: StorageLocationResponse;
    batches: { batch: StockBatchResponse; ingredientName: string; unit: string; sku: string }[];
  } | null>(null);

  // Modal creation states
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New Ingredient form
  const [newIngName, setNewIngName] = useState('');
  const [newIngSku, setNewIngSku] = useState('');
  const [newIngCategoryId, setNewIngCategoryId] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('kg');
  const [newIngMinStock, setNewIngMinStock] = useState('10');
  const [newIngMaxStock, setNewIngMaxStock] = useState('50');

  // New Category form
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // New Location form
  const [newLocName, setNewLocName] = useState('');
  const [newLocDesc, setNewLocDesc] = useState('');
  const [newLocTemp, setNewLocTemp] = useState('REFRIGERATED');

  // Modal editing states
  const [editingIngredient, setEditingIngredient] = useState<IngredientResponse | null>(null);
  const [editIngName, setEditIngName] = useState('');
  const [editIngSku, setEditIngSku] = useState('');
  const [editIngCategoryId, setEditIngCategoryId] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('kg');
  const [editIngMinStock, setEditIngMinStock] = useState('10');
  const [editIngMaxStock, setEditIngMaxStock] = useState('50');

  const [editingCategory, setEditingCategory] = useState<CategoryResponse | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatDesc, setEditCatDesc] = useState('');

  const [editingLocation, setEditingLocation] = useState<StorageLocationResponse | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const [editLocDesc, setEditLocDesc] = useState('');
  const [editLocTemp, setEditLocTemp] = useState('REFRIGERATED');
  const [editLocIsActive, setEditLocIsActive] = useState<boolean>(true);

  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'INVENTORY_MANAGER';

  const getBatchesInLocation = (locationId: string) => {
    const batches: { batch: StockBatchResponse; ingredientName: string; unit: string; sku: string }[] = [];
    inventory.forEach((inv) => {
      inv.batches?.forEach((b) => {
        if (b.storageLocationId === locationId && b.quantity > 0) {
          batches.push({
            batch: b,
            ingredientName: inv.ingredientName,
            unit: inv.unit,
            sku: inv.sku,
          });
        }
      });
    });
    return batches;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ingRes, catRes, locRes, invRes] = await Promise.all([
        api.getIngredients(),
        api.getCategories(),
        api.getStorageLocations(),
        api.getInventory().catch(() => []),
      ]);
      setIngredients(ingRes);
      setCategories(catRes);
      setLocations(locRes);
      setInventory(invRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load master catalog data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getIngredients(),
      api.getCategories(),
      api.getStorageLocations(),
      api.getInventory().catch(() => []),
    ]).then(([ingRes, catRes, locRes, invRes]) => {
      if (!ignore) {
        setIngredients(ingRes);
        setCategories(catRes);
        setLocations(locRes);
        setInventory(invRes);
        setLoading(false);
      }
    }).catch((err) => {
      if (!ignore) {
        setError(err instanceof Error ? err.message : 'Failed to load master catalog data.');
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngCategoryId) {
      setError('Please select a category for the ingredient.');
      return;
    }
    setError(null);
    try {
      await api.createIngredient({
        name: newIngName.trim(),
        sku: newIngSku.trim().toUpperCase(),
        categoryId: newIngCategoryId,
        unit: newIngUnit.trim(),
        minimumStockLevel: parseFloat(newIngMinStock) || 0,
        maximumStockLevel: parseFloat(newIngMaxStock) || 0,
      });
      onSuccess(`Ingredient "${newIngName}" created successfully.`);
      setShowAddModal(false);
      setNewIngName('');
      setNewIngSku('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ingredient.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createCategory({
        name: newCatName.trim(),
        description: newCatDesc.trim() || undefined,
      });
      onSuccess(`Category "${newCatName}" created successfully.`);
      setShowAddModal(false);
      setNewCatName('');
      setNewCatDesc('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category.');
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createStorageLocation({
        name: newLocName.trim(),
        description: newLocDesc.trim() || undefined,
        temperatureType: newLocTemp,
      });
      onSuccess(`Storage location "${newLocName}" created successfully.`);
      setShowAddModal(false);
      setNewLocName('');
      setNewLocDesc('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location.');
    }
  };

  const handleOpenEditIngredient = (ing: IngredientResponse) => {
    setEditingIngredient(ing);
    setEditIngName(ing.name);
    setEditIngSku(ing.sku);
    setEditIngCategoryId(ing.categoryId);
    setEditIngUnit(ing.unit);
    setEditIngMinStock(ing.minimumStockLevel.toString());
    setEditIngMaxStock(ing.maximumStockLevel.toString());
    setError(null);
  };

  const handleUpdateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIngredient) return;
    if (!editIngCategoryId) {
      setError('Please select a category for the ingredient.');
      return;
    }
    setError(null);
    try {
      await api.updateIngredient(editingIngredient.id, {
        name: editIngName.trim(),
        sku: editIngSku.trim().toUpperCase(),
        categoryId: editIngCategoryId,
        unit: editIngUnit.trim(),
        minimumStockLevel: parseFloat(editIngMinStock) || 0,
        maximumStockLevel: parseFloat(editIngMaxStock) || 0,
      });
      onSuccess(`Ingredient "${editIngName}" updated successfully.`);
      setEditingIngredient(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ingredient.');
    }
  };

  const handleOpenEditCategory = (cat: CategoryResponse) => {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setEditCatDesc(cat.description || '');
    setError(null);
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setError(null);
    try {
      await api.updateCategory(editingCategory.id, {
        name: editCatName.trim(),
        description: editCatDesc.trim() || undefined,
      });
      onSuccess(`Category "${editCatName}" updated successfully.`);
      setEditingCategory(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category.');
    }
  };

  const handleOpenEditLocation = (loc: StorageLocationResponse) => {
    setEditingLocation(loc);
    setEditLocName(loc.name);
    setEditLocDesc(loc.description || '');
    setEditLocTemp(loc.temperatureType || 'AMBIENT');
    setEditLocIsActive(loc.isActive);
    setError(null);
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation) return;
    setError(null);
    try {
      await api.updateStorageLocation(editingLocation.id, {
        name: editLocName.trim(),
        description: editLocDesc.trim() || undefined,
        temperatureType: editLocTemp,
        isActive: editLocIsActive,
      });
      onSuccess(`Storage location "${editLocName}" updated successfully.`);
      setEditingLocation(null);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update storage location.');
    }
  };

  const handleDeleteIngredient = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete ingredient "${name}" from the database? (Available stock must be 0)`)) return;
    try {
      await api.deleteIngredient(id);
      onSuccess(`Ingredient "${name}" permanently deleted from database and storage locations.`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ingredient.');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;
    try {
      await api.deleteCategory(id);
      onSuccess(`Category "${name}" removed.`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category.');
    }
  };

  const handleToggleLocationActive = async (loc: StorageLocationResponse) => {
    const nextState = !loc.isActive;
    const stuckBatches = getBatchesInLocation(loc.id);

    if (!nextState) {
      const confirmMsg = stuckBatches.length > 0
        ? `Are you sure you want to deactivate storage location "${loc.name}"? It currently contains ${stuckBatches.length} batch(es). No new stock can be received or added into this location, and all existing stock must be relocated immediately.`
        : `Are you sure you want to deactivate storage location "${loc.name}"? No new stock will be allowed in this location.`;
      if (!confirm(confirmMsg)) return;
    }

    try {
      await api.updateStorageLocation(loc.id, {
        name: loc.name,
        description: loc.description || undefined,
        temperatureType: loc.temperatureType || undefined,
        isActive: nextState,
      });

      if (!nextState) {
        if (stuckBatches.length > 0) {
          onSuccess(`Storage location "${loc.name}" deactivated. Immediate action required: Move these stocks to other locations!`);
          setViewingRelocationLocation({
            location: { ...loc, isActive: false },
            batches: stuckBatches,
          });
        } else {
          onSuccess(`Storage location "${loc.name}" deactivated.`);
        }
      } else {
        onSuccess(`Storage location "${loc.name}" activated.`);
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update storage location status.');
    }
  };

  return (
    <div className="view-container">
      {/* Subtabs and Actions */}
      <div className="catalog-header">
        <div className="catalog-tabs">
          <button
            type="button"
            className={`catalog-tab ${subTab === 'ingredients' ? 'active' : ''}`}
            onClick={() => setSubTab('ingredients')}
          >
            <UtensilsCrossed size={16} />
            <span>Ingredients ({ingredients.length})</span>
          </button>
          <button
            type="button"
            className={`catalog-tab ${subTab === 'categories' ? 'active' : ''}`}
            onClick={() => setSubTab('categories')}
          >
            <Tag size={16} />
            <span>Categories ({categories.length})</span>
          </button>
          <button
            type="button"
            className={`catalog-tab ${subTab === 'locations' ? 'active' : ''}`}
            onClick={() => setSubTab('locations')}
          >
            <MapPin size={16} />
            <span>Storage Locations ({locations.length})</span>
          </button>
        </div>

        <div className="catalog-actions">
          <button type="button" className="btn-icon" onClick={loadData} title="Refresh">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setError(null);
                setShowAddModal(true);
              }}
            >
              <PlusCircle size={16} />
              <span>
                Add{' '}
                {subTab === 'ingredients'
                  ? 'Ingredient'
                  : subTab === 'categories'
                  ? 'Category'
                  : 'Location'}
              </span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert-error mb-4">{error}</div>}

      {/* TABLE: INGREDIENTS */}
      {subTab === 'ingredients' && (
        <div className="table-card">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Ingredient Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Measurement Unit</th>
                <th>Min / Max Safe Level</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => (
                <tr key={ing.id}>
                  <td>
                    <strong>{ing.name}</strong>
                  </td>
                  <td>
                    <span className="font-mono text-accent">{ing.sku}</span>
                  </td>
                  <td>
                    <span className="badge badge-default">{ing.categoryName}</span>
                  </td>
                  <td>{ing.unit}</td>
                  <td className="text-muted">
                    Min: {ing.minimumStockLevel} / Max: {ing.maximumStockLevel}
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <div className="action-buttons-row">
                        <button
                          type="button"
                          className="btn-batch-action btn-batch-adjust"
                          title="Edit ingredient specifications"
                          onClick={() => handleOpenEditIngredient(ing)}
                        >
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn-batch-action btn-batch-waste"
                          title="Soft delete ingredient"
                          onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLE: CATEGORIES */}
      {subTab === 'categories' && (
        <div className="table-card">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Category Name</th>
                <th>Description</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <strong>{cat.name}</strong>
                  </td>
                  <td className="text-muted">{cat.description || '—'}</td>
                  {canEdit && (
                    <td className="text-right">
                      <div className="action-buttons-row">
                        <button
                          type="button"
                          className="btn-batch-action btn-batch-adjust"
                          title="Edit category"
                          onClick={() => handleOpenEditCategory(cat)}
                        >
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn-batch-action btn-batch-waste"
                          title="Delete category"
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLE: STORAGE LOCATIONS */}
      {subTab === 'locations' && (
        <div>
          {/* Relocation alert notice banner if any deactivated location holds stock */}
          {locations.some((l) => !l.isActive && getBatchesInLocation(l.id).length > 0) && (
            <div className="alert-warning mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertTriangle size={20} className="text-amber" />
                <div>
                  <strong style={{ color: 'var(--amber)', display: 'block' }}>Immediate Action Required:</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    One or more deactivated storage locations currently contain stock. Stock cannot be added to deactivated locations; please move these stocks immediately.
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="table-card">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Location Name</th>
                  <th>Temperature Type</th>
                  <th>Description</th>
                  <th>Status</th>
                  {canEdit && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => {
                  const stuckBatches = getBatchesInLocation(loc.id);
                  const isDeactivatedWithStock = !loc.isActive && stuckBatches.length > 0;

                  return (
                    <tr key={loc.id}>
                      <td>
                        <strong>{loc.name}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            loc.temperatureType === 'FROZEN'
                              ? 'badge-blue'
                              : loc.temperatureType === 'REFRIGERATED'
                              ? 'badge-purple'
                              : 'badge-amber'
                          }`}
                        >
                          <Thermometer size={12} className="inline-icon" />
                          {loc.temperatureType || 'AMBIENT'}
                        </span>
                      </td>
                      <td className="text-muted">{loc.description || '—'}</td>
                      <td>
                        <span className={`badge ${loc.isActive ? 'badge-emerald' : 'badge-rose'}`}>
                          {loc.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="text-right">
                          <div className="action-buttons-row">
                            {/* Edit Button */}
                            <button
                              type="button"
                              className="btn-batch-action btn-batch-adjust"
                              title="Edit storage location"
                              onClick={() => handleOpenEditLocation(loc)}
                            >
                              <Pencil size={12} />
                              <span>Edit</span>
                            </button>

                            {/* Activate / Deactivate Toggle Button */}
                            {loc.isActive ? (
                              <button
                                type="button"
                                className="btn-batch-action btn-batch-waste"
                                title="Deactivate location (blocks new stock from being added)"
                                onClick={() => handleToggleLocationActive(loc)}
                              >
                                <PowerOff size={12} />
                                <span>Deactivate</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-batch-action btn-batch-receive"
                                title="Activate storage location"
                                onClick={() => handleToggleLocationActive(loc)}
                              >
                                <Power size={12} />
                                <span>Activate</span>
                              </button>
                            )}

                            {/* Notifications Button for Deactivated Location with Existing Stock */}
                            {isDeactivatedWithStock && (
                              <button
                                type="button"
                                className="btn-batch-action btn-batch-alert btn-pulse-amber"
                                title="Immediate action required: Move stock to other locations"
                                onClick={() =>
                                  setViewingRelocationLocation({
                                    location: loc,
                                    batches: stuckBatches,
                                  })
                                }
                              >
                                <Bell size={12} />
                                <span>Notifications ({stuckBatches.length})</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD MASTER DATA MODAL */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowAddModal(false)}
            >
              <X size={20} />
            </button>

            {/* ADD INGREDIENT FORM */}
            {subTab === 'ingredients' && (
              <div>
                <div className="modal-header">
                  <div className="modal-icon-badge bg-emerald-glow">
                    <UtensilsCrossed size={22} className="text-emerald" />
                  </div>
                  <div>
                    <h3>Create New Ingredient</h3>
                    <p>Add a new ingredient specification to the catalog</p>
                  </div>
                </div>

                <form onSubmit={handleCreateIngredient} className="modal-form">
                  <div className="form-group">
                    <label>Ingredient Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ground Beef, Olive Oil"
                      value={newIngName}
                      onChange={(e) => setNewIngName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>SKU Code</label>
                      <input
                        type="text"
                        placeholder="e.g. MEAT-002, OIL-001"
                        value={newIngSku}
                        onChange={(e) => setNewIngSku(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Measurement Unit</label>
                      <input
                        type="text"
                        placeholder="kg, pcs, liters, bags"
                        value={newIngUnit}
                        onChange={(e) => setNewIngUnit(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={newIngCategoryId}
                      onChange={(e) => setNewIngCategoryId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Min Safe Stock</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={newIngMinStock}
                        onChange={(e) => setNewIngMinStock(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Safe Stock</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={newIngMaxStock}
                        onChange={(e) => setNewIngMaxStock(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Save Ingredient
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ADD CATEGORY FORM */}
            {subTab === 'categories' && (
              <div>
                <div className="modal-header">
                  <div className="modal-icon-badge bg-blue-glow">
                    <Tag size={22} className="text-blue" />
                  </div>
                  <div>
                    <h3>Create New Category</h3>
                    <p>Categorize your restaurant inventory items</p>
                  </div>
                </div>

                <form onSubmit={handleCreateCategory} className="modal-form">
                  <div className="form-group">
                    <label>Category Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Seafood, Spices, Bakery"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      rows={3}
                      placeholder="Brief note on item group..."
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                    />
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Save Category
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ADD LOCATION FORM */}
            {subTab === 'locations' && (
              <div>
                <div className="modal-header">
                  <div className="modal-icon-badge bg-purple-glow">
                    <MapPin size={22} className="text-accent" />
                  </div>
                  <div>
                    <h3>Create Storage Location</h3>
                    <p>Register a refrigerator, walk-in freezer, or dry shelf</p>
                  </div>
                </div>

                <form onSubmit={handleCreateLocation} className="modal-form">
                  <div className="form-group">
                    <label>Location Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Walk-in Cooler B, Shelf 4"
                      value={newLocName}
                      onChange={(e) => setNewLocName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Temperature Type</label>
                    <select
                      value={newLocTemp}
                      onChange={(e) => setNewLocTemp(e.target.value)}
                      required
                    >
                      <option value="REFRIGERATED">REFRIGERATED (Chiller / Cold room)</option>
                      <option value="FROZEN">FROZEN (Deep freezer)</option>
                      <option value="AMBIENT">AMBIENT (Room temp dry pantry)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Kitchen rear cold room zone 1"
                      value={newLocDesc}
                      onChange={(e) => setNewLocDesc(e.target.value)}
                    />
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowAddModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Save Location
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT INGREDIENT MODAL */}
      {editingIngredient && (
        <div className="modal-overlay" onClick={() => setEditingIngredient(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setEditingIngredient(null)}
            >
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-amber-glow">
                <Pencil size={22} className="text-amber" />
              </div>
              <div>
                <h3>Edit Ingredient</h3>
                <p>Update specifications for {editingIngredient.name}</p>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleUpdateIngredient} className="modal-form">
              <div className="form-group">
                <label>Ingredient Name</label>
                <input
                  type="text"
                  value={editIngName}
                  onChange={(e) => setEditIngName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>SKU Code</label>
                  <input
                    type="text"
                    value={editIngSku}
                    onChange={(e) => setEditIngSku(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Measurement Unit</label>
                  <input
                    type="text"
                    value={editIngUnit}
                    onChange={(e) => setEditIngUnit(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={editIngCategoryId}
                  onChange={(e) => setEditIngCategoryId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Min Safe Stock</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editIngMinStock}
                    onChange={(e) => setEditIngMinStock(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Max Safe Stock</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editIngMaxStock}
                    onChange={(e) => setEditIngMaxStock(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingIngredient(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CATEGORY MODAL */}
      {editingCategory && (
        <div className="modal-overlay" onClick={() => setEditingCategory(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setEditingCategory(null)}
            >
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <Pencil size={22} className="text-blue" />
              </div>
              <div>
                <h3>Edit Category</h3>
                <p>Modify category name and description</p>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleUpdateCategory} className="modal-form">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={editCatDesc}
                  onChange={(e) => setEditCatDesc(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingCategory(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LOCATION MODAL */}
      {editingLocation && (
        <div className="modal-overlay" onClick={() => setEditingLocation(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setEditingLocation(null)}
            >
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-purple-glow">
                <Pencil size={22} className="text-accent" />
              </div>
              <div>
                <h3>Edit Storage Location</h3>
                <p>Update temperature zone and storage details</p>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleUpdateLocation} className="modal-form">
              <div className="form-group">
                <label>Location Name</label>
                <input
                  type="text"
                  value={editLocName}
                  onChange={(e) => setEditLocName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Temperature Type</label>
                <select
                  value={editLocTemp}
                  onChange={(e) => setEditLocTemp(e.target.value)}
                  required
                >
                  <option value="REFRIGERATED">REFRIGERATED (Chiller / Cold room)</option>
                  <option value="FROZEN">FROZEN (Deep freezer)</option>
                  <option value="AMBIENT">AMBIENT (Room temp dry pantry)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={2}
                  value={editLocDesc}
                  onChange={(e) => setEditLocDesc(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={editLocIsActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditLocIsActive(e.target.value === 'active')}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingLocation(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STORAGE LOCATION RELOCATION NOTIFICATION MODAL */}
      {viewingRelocationLocation && (
        <div
          className="modal-overlay"
          onClick={() => setViewingRelocationLocation(null)}
        >
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setViewingRelocationLocation(null)}
            >
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <AlertTriangle size={22} className="text-rose" />
              </div>
              <div>
                <h3>Storage Location Relocation Alert</h3>
                <p>Location: <strong>{viewingRelocationLocation.location.name}</strong> (Deactivated)</p>
              </div>
            </div>

            <div
              className="alert-error mb-4"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
              }}
            >
              <Bell size={24} className="text-rose" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong
                  style={{
                    fontSize: '1rem',
                    color: '#f43f5e',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}
                >
                  Immediate action required: Move these stocks to other locations!
                </strong>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.45' }}>
                  Storage location <strong>{viewingRelocationLocation.location.name}</strong> is currently deactivated.
                  No new stock can be received or added into this location. The {viewingRelocationLocation.batches.length} batch(es)
                  listed below are currently stored here and must be moved to active locations immediately.
                </p>
              </div>
            </div>

            <div className="table-card mb-4" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Ingredient & SKU</th>
                    <th>Batch Number</th>
                    <th>Quantity On-Hand</th>
                    <th>Expiry Date</th>
                    {onOpenModal && <th className="text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {viewingRelocationLocation.batches.map((item) => (
                    <tr key={item.batch.id}>
                      <td>
                        <strong>{item.ingredientName}</strong>
                        <div className="text-xs font-mono text-muted">{item.sku}</div>
                      </td>
                      <td>
                        <span className="font-mono text-accent">{item.batch.batchNumber}</span>
                      </td>
                      <td>
                        <span className="text-rose font-bold">
                          {item.batch.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="text-muted">
                        {item.batch.expiryDate
                          ? new Date(item.batch.expiryDate).toLocaleDateString()
                          : 'No expiry date'}
                      </td>
                      {onOpenModal && (
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              const batchToTransfer = item.batch;
                              const ingName = item.ingredientName;
                              setViewingRelocationLocation(null);
                              onOpenModal({
                                type: 'transfer',
                                batch: batchToTransfer,
                                ingredientName: ingName,
                              });
                            }}
                          >
                            <ArrowRightLeft size={12} style={{ marginRight: '4px' }} />
                            <span>Transfer / Relocate</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewingRelocationLocation(null)}
              >
                Close Notification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
