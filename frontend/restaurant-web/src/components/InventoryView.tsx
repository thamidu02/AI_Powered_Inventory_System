import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  MapPin,
  PackageCheck,
  PackageMinus,
  Pencil,
  RefreshCw,
  Search,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  ActiveModal,
  CategoryResponse,
  IngredientResponse,
  InventoryResponse,
  StockBatchResponse,
} from '../types';
import { useAuth } from '../context/useAuth';

interface InventoryViewProps {
  onOpenModal: (modal: ActiveModal) => void;
  refreshTrigger: number;
  onSuccess?: (msg: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onOpenModal,
  refreshTrigger,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<StockBatchResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [expandedIngredients, setExpandedIngredients] = useState<Record<string, boolean>>({});

  // Edit ingredient states
  const [editingIngredient, setEditingIngredient] = useState<IngredientResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [editIngName, setEditIngName] = useState('');
  const [editIngSku, setEditIngSku] = useState('');
  const [editIngCategoryId, setEditIngCategoryId] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('');
  const [editIngMinStock, setEditIngMinStock] = useState('10');
  const [editIngMaxStock, setEditIngMaxStock] = useState('50');
  const [editIngIsActive, setEditIngIsActive] = useState<boolean>(true);
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canConsume = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER' || user?.role === 'SALES_KITCHEN_STAFF';
  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'INVENTORY_MANAGER';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invData, expiringData] = await Promise.all([
        api.getInventory(),
        api.getExpiringStock(7).catch(() => []),
      ]);
      setInventory(invData);
      setExpiringBatches(expiringData);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([
      api.getInventory(),
      api.getExpiringStock(7).catch(() => []),
    ]).then(([invData, expiringData]) => {
      if (!ignore) {
        setInventory(invData);
        setExpiringBatches(expiringData);
        setLoading(false);
      }
    }).catch((err) => {
      if (!ignore) {
        console.error('Failed to load inventory data:', err);
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [refreshTrigger]);

  const toggleExpand = (ingredientId: string) => {
    setExpandedIngredients((prev) => ({
      ...prev,
      [ingredientId]: !prev[ingredientId],
    }));
  };

  const handleOpenEdit = async (item: InventoryResponse) => {
    setEditLoading(true);
    setEditError(null);
    try {
      const [fullIng, allCats] = await Promise.all([
        api.getIngredient(item.ingredientId),
        categories.length > 0 ? Promise.resolve(categories) : api.getCategories(),
      ]);
      setCategories(allCats);
      setEditingIngredient(fullIng);
      setEditIngName(fullIng.name);
      setEditIngSku(fullIng.sku);
      setEditIngCategoryId(fullIng.categoryId);
      setEditIngUnit(fullIng.unit);
      setEditIngMinStock(fullIng.minimumStockLevel.toString());
      setEditIngMaxStock(fullIng.maximumStockLevel.toString());
      setEditIngIsActive(fullIng.isActive);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load ingredient details for editing.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIngredient) return;
    if (!editIngCategoryId) {
      setEditError('Please select a valid category.');
      return;
    }
    setEditError(null);
    setEditLoading(true);
    try {
      await api.updateIngredient(editingIngredient.id, {
        name: editIngName.trim(),
        sku: editIngSku.trim().toUpperCase(),
        categoryId: editIngCategoryId,
        unit: editIngUnit.trim(),
        minimumStockLevel: parseFloat(editIngMinStock) || 0,
        maximumStockLevel: parseFloat(editIngMaxStock) || 0,
        isActive: editIngIsActive,
      });
      if (onSuccess) {
        onSuccess(`Ingredient "${editIngName}" updated successfully.`);
      }
      setEditingIngredient(null);
      fetchData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update ingredient.');
    } finally {
      setEditLoading(false);
    }
  };

  const outOfStockCount = inventory.filter((i) => i.currentStock <= 0).length;
  const lowStockCount = inventory.filter((i) => i.currentStock > 0 && i.isLowStock).length;
  const totalAlerts = outOfStockCount + lowStockCount;
  const totalBatches = inventory.reduce((acc, curr) => acc + (curr.batches?.length || 0), 0);

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = !showLowStockOnly || item.isLowStock || item.currentStock <= 0;
    return matchesSearch && matchesLowStock;
  });

  return (
    <div className="view-container">
      {/* KPI Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <Boxes size={24} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Ingredients</span>
            <span className="stat-value">{inventory.length}</span>
            <span className="stat-subtext">Active catalogue items</span>
          </div>
        </div>

        <div className={`stat-card ${outOfStockCount > 0 ? 'stat-danger' : lowStockCount > 0 ? 'stat-warning' : ''}`}>
          <div className={`stat-icon-wrapper ${outOfStockCount > 0 ? 'bg-rose-glow' : 'bg-amber-glow'}`}>
            {outOfStockCount > 0 ? (
              <AlertOctagon size={24} className="text-rose" />
            ) : (
              <AlertTriangle size={24} className="text-amber" />
            )}
          </div>
          <div className="stat-content">
            <span className="stat-label">Stock Alerts</span>
            <span className="stat-value">
              {outOfStockCount > 0 ? `${outOfStockCount} Out / ${lowStockCount} Low` : `${lowStockCount} Low Stock`}
            </span>
            <span className="stat-subtext">
              {outOfStockCount > 0
                ? `${outOfStockCount} depleted, ${lowStockCount} below minimum`
                : 'Below minimum safe threshold'}
            </span>
          </div>
        </div>

        <div className={`stat-card ${expiringBatches.length > 0 ? 'stat-danger' : ''}`}>
          <div className="stat-icon-wrapper bg-rose-glow">
            <Clock size={24} className="text-rose" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Expiring Soon (7d)</span>
            <span className="stat-value">{expiringBatches.length}</span>
            <span className="stat-subtext">Batches needing prioritization</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <PackageCheck size={24} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Active Batches</span>
            <span className="stat-value">{totalBatches}</span>
            <span className="stat-subtext">Tracked across locations</span>
          </div>
        </div>
      </div>

      {/* Action Header & Search Controls */}
      <div className="controls-bar">
        <div className="search-group">
          <div className="input-with-icon search-input">
            <Search size={18} className="input-icon" />
            <input
              type="text"
              placeholder="Search by ingredient name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`btn-filter ${showLowStockOnly ? 'active' : ''}`}
            onClick={() => setShowLowStockOnly(!showLowStockOnly)}
          >
            <Filter size={16} />
            <span>Low / Out of Stock ({totalAlerts})</span>
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={fetchData}
            title="Refresh Inventory"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="quick-actions">
          {canConsume && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onOpenModal({ type: 'consume' })}
            >
              <PackageMinus size={16} />
              <span>Consume Stock (FEFO)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Inventory Table */}
      <div className="table-card">
        {loading && inventory.length === 0 ? (
          <div className="table-loading">
            <RefreshCw size={24} className="spin" />
            <span>Loading live inventory data from database...</span>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="empty-state">
            <Boxes size={48} className="empty-icon" />
            <h3>No inventory items found</h3>
            <p>
              {searchTerm || showLowStockOnly
                ? 'Try adjusting your search or low-stock filter.'
                : 'No ingredients exist yet in the database.'}
            </p>
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Ingredient & SKU</th>
                <th>Current Stock</th>
                <th>Unit</th>
                <th>Min / Max Safe Stock</th>
                <th>Status</th>
                <th>Batches</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => {
                const isExpanded = !!expandedIngredients[item.ingredientId];
                const activeBatchCount = item.batches?.filter(
                  (b) => b.quantity > 0
                ).length || 0;

                return (
                  <React.Fragment key={item.ingredientId}>
                    <tr
                      className={`row-clickable ${isExpanded ? 'row-expanded' : ''}`}
                      onClick={() => toggleExpand(item.ingredientId)}
                    >
                      <td className="expand-cell">
                        {isExpanded ? (
                          <ChevronDown size={18} className="text-muted" />
                        ) : (
                          <ChevronRight size={18} className="text-muted" />
                        )}
                      </td>
                      <td>
                        <div className="ingredient-title">{item.ingredientName}</div>
                        <div className="ingredient-sku">{item.sku}</div>
                      </td>
                      <td>
                        <span
                          className={`stock-number ${
                            item.currentStock <= 0
                              ? 'text-rose font-bold'
                              : item.isLowStock
                              ? 'text-amber font-bold'
                              : ''
                          }`}
                        >
                          {item.currentStock.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}
                        </span>
                      </td>
                      <td className="text-muted">{item.unit}</td>
                      <td>
                        <span className="text-muted">
                          Min: {item.minimumStockLevel} / Max: {item.maximumStockLevel}
                        </span>
                      </td>
                      <td>
                        {item.currentStock <= 0 ? (
                          <span className="badge badge-rose">
                            <AlertOctagon size={12} className="inline-icon" />
                            OUT OF STOCK
                          </span>
                        ) : item.isLowStock ? (
                          <span className="badge badge-amber">
                            <AlertTriangle size={12} className="inline-icon" />
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="badge badge-emerald">HEALTHY</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-default">
                          {activeBatchCount} {activeBatchCount === 1 ? 'batch' : 'batches'}
                        </span>
                      </td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="action-buttons-row">
                          {canConsume && (
                            <button
                              type="button"
                              className="btn-table-action"
                              title={
                                item.currentStock <= 0
                                  ? 'Out of stock (cannot consume)'
                                  : 'Consume stock (FEFO)'
                              }
                              disabled={item.currentStock <= 0}
                              onClick={() =>
                                onOpenModal({
                                  type: 'consume',
                                  ingredientId: item.ingredientId,
                                  ingredientName: item.ingredientName,
                                  unit: item.unit,
                                  sku: item.sku,
                                  currentStock: item.currentStock,
                                })
                              }
                            >
                              <PackageMinus size={14} />
                              <span>Consume</span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className="btn-table-action"
                              title="Edit ingredient specifications"
                              disabled={editLoading}
                              onClick={() => handleOpenEdit(item)}
                            >
                              <Pencil size={14} />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Batch Detail Row */}
                    {isExpanded && (
                      <tr className="nested-batch-row">
                        <td colSpan={8}>
                          <div className="batch-accordion-content">
                            <div className="batch-header">
                              <h4>
                                Active Batches for {item.ingredientName} ({item.unit})
                              </h4>
                              <span className="text-muted text-sm">
                                Batches are depleted automatically via FEFO (Earliest Expiry First)
                              </span>
                            </div>

                            {item.batches && item.batches.length > 0 ? (
                              <table className="nested-batch-table">
                                <thead>
                                  <tr>
                                    <th>Batch Number</th>
                                    <th>Location</th>
                                    <th>Quantity</th>
                                    <th>Unit Cost</th>
                                    <th>Received Date</th>
                                    <th>Expiry Date</th>
                                    <th>Status</th>
                                    <th className="text-right">Batch Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.batches.map((batch) => {
                                    const isExpired =
                                      batch.expiryDate &&
                                      new Date(batch.expiryDate) < new Date();
                                    const isSoon =
                                      batch.expiryDate &&
                                      !isExpired &&
                                      new Date(batch.expiryDate) <=
                                        new Date(Date.now() + 7 * 86400000);

                                    return (
                                      <tr key={batch.id}>
                                        <td className="font-mono text-accent">
                                          {batch.batchNumber}
                                        </td>
                                        <td>
                                          <span className="location-pill">
                                            <MapPin size={12} className="inline-icon" />
                                            {batch.storageLocationName}
                                          </span>
                                        </td>
                                        <td>
                                          <strong>{batch.quantity}</strong> {item.unit}
                                        </td>
                                        <td>${batch.unitCost.toFixed(2)}</td>
                                        <td className="text-muted">
                                          {new Date(batch.receivedDate).toLocaleDateString()}
                                        </td>
                                        <td>
                                          {batch.expiryDate ? (
                                            <span
                                              className={
                                                isExpired
                                                  ? 'text-rose font-bold'
                                                  : isSoon
                                                  ? 'text-amber font-bold'
                                                  : 'text-muted'
                                              }
                                            >
                                              {new Date(batch.expiryDate).toLocaleDateString()}
                                              {isExpired && ' (EXPIRED)'}
                                              {isSoon && ' (SOON)'}
                                            </span>
                                          ) : (
                                            <span className="text-muted">No Expiry</span>
                                          )}
                                        </td>
                                        <td>
                                          <span
                                            className={`badge ${
                                              batch.status === 'AVAILABLE'
                                                ? 'badge-emerald'
                                                : batch.status === 'PARTIALLY_USED'
                                                ? 'badge-blue'
                                                : 'badge-default'
                                            }`}
                                          >
                                            {batch.status}
                                          </span>
                                        </td>
                                        <td className="text-right">
                                          <div className="batch-action-buttons">
                                            {/* Waste button */}
                                            {batch.quantity > 0 && (
                                              <button
                                                type="button"
                                                className="btn-batch-action btn-batch-waste"
                                                title="Record spoiled or wasted stock from this batch"
                                                onClick={() =>
                                                  onOpenModal({
                                                    type: 'waste',
                                                    batch,
                                                    ingredientName: item.ingredientName,
                                                  })
                                                }
                                              >
                                                <Trash2 size={12} />
                                                <span>Waste</span>
                                              </button>
                                            )}

                                            {/* Adjust button */}
                                            <button
                                              type="button"
                                              className="btn-batch-action btn-batch-adjust"
                                              title="Adjust batch count (±). Discrepancies ≥ 10 require Manager approval"
                                              onClick={() =>
                                                onOpenModal({
                                                  type: 'adjust',
                                                  batch,
                                                  ingredientName: item.ingredientName,
                                                })
                                              }
                                            >
                                              <Sliders size={12} />
                                              <span>Adjust</span>
                                            </button>

                                            {/* Transfer button */}
                                            {batch.quantity > 0 && (
                                              <button
                                                type="button"
                                                className="btn-batch-action btn-batch-transfer"
                                                title="Transfer quantity to another location"
                                                onClick={() =>
                                                  onOpenModal({
                                                    type: 'transfer',
                                                    batch,
                                                    ingredientName: item.ingredientName,
                                                  })
                                                }
                                              >
                                                <ArrowDownUp size={12} />
                                                <span>Transfer</span>
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="p-4 text-muted text-sm text-center">
                                No batches currently received for this ingredient.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Ingredient Modal */}
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

            {editError && <div className="alert-error mb-4">{editError}</div>}

            <form onSubmit={handleSaveEdit} className="modal-form">
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
                <button type="submit" className="btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
