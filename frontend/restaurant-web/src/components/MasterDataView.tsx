import React, { useEffect, useState } from 'react';
import {
  MapPin,
  PlusCircle,
  RefreshCw,
  Tag,
  Thermometer,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  CategoryResponse,
  IngredientResponse,
  StorageLocationResponse,
} from '../types';
import { useAuth } from '../context/useAuth';

interface MasterDataViewProps {
  onSuccess: (msg: string) => void;
}

export const MasterDataView: React.FC<MasterDataViewProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'ingredients' | 'categories' | 'locations'>('ingredients');

  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [locations, setLocations] = useState<StorageLocationResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'INVENTORY_MANAGER';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ingRes, catRes, locRes] = await Promise.all([
        api.getIngredients(),
        api.getCategories(),
        api.getStorageLocations(),
      ]);
      setIngredients(ingRes);
      setCategories(catRes);
      setLocations(locRes);
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
    ]).then(([ingRes, catRes, locRes]) => {
      if (!ignore) {
        setIngredients(ingRes);
        setCategories(catRes);
        setLocations(locRes);
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

  const handleDeleteIngredient = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate ingredient "${name}"?`)) return;
    try {
      await api.deleteIngredient(id);
      onSuccess(`Ingredient "${name}" deactivated.`);
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

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate storage location "${name}"?`)) return;
    try {
      await api.deleteStorageLocation(id);
      onSuccess(`Location "${name}" deactivated.`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete storage location.');
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
                <th>Status</th>
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
                  <td>
                    <span className={`badge ${ing.isActive ? 'badge-emerald' : 'badge-rose'}`}>
                      {ing.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-batch-action btn-batch-waste"
                        title="Soft delete ingredient"
                        onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
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
                <th>Status</th>
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
                  <td>
                    <span className="badge badge-emerald">ACTIVE</span>
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-batch-action btn-batch-waste"
                        title="Delete category"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
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
              {locations.map((loc) => (
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
                      <button
                        type="button"
                        className="btn-batch-action btn-batch-waste"
                        title="Deactivate location"
                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                      >
                        <Trash2 size={12} />
                        <span>Deactivate</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
};
