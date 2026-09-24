import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  History,
  MapPin,
  PackageCheck,
  PackageMinus,
  Pencil,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  X,
  CheckCircle2,
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
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [expandedIngredients, setExpandedIngredients] = useState<Record<string, boolean>>({});

  // Edit ingredient states
  const [editingIngredient, setEditingIngredient] = useState<IngredientResponse | null>(null);
  const [editIngName, setEditIngName] = useState('');
  const [editIngSku, setEditIngSku] = useState('');
  const [editIngCategoryId, setEditIngCategoryId] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('');
  const [editIngMinStock, setEditIngMinStock] = useState('10');
  const [editIngMaxStock, setEditIngMaxStock] = useState('50');
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const canReceive = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER';
  const canConsume = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER' || user?.role === 'SALES_KITCHEN_STAFF';
  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'INVENTORY_MANAGER';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invData, expiringData, catsData] = await Promise.all([
        api.getInventory(),
        api.getExpiringStock(7).catch(() => []),
        api.getCategories().catch(() => []),
      ]);
      setInventory(invData);
      setExpiringBatches(expiringData);
      setCategories(catsData);
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
      api.getCategories().catch(() => []),
    ]).then(([invData, expiringData, catsData]) => {
      if (!ignore) {
        setInventory(invData);
        setExpiringBatches(expiringData);
        setCategories(catsData);
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
      const fullIng = await api.getIngredient(item.ingredientId);
      setEditingIngredient(fullIng);
      setEditIngName(fullIng.name);
      setEditIngSku(fullIng.sku);
      setEditIngCategoryId(fullIng.categoryId);
      setEditIngUnit(fullIng.unit);
      setEditIngMinStock(fullIng.minimumStockLevel.toString());
      setEditIngMaxStock(fullIng.maximumStockLevel.toString());
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

  const handleExportCSV = () => {
    if (inventory.length === 0) return;
    const headers = ['Ingredient Name', 'SKU', 'Unit', 'Current Stock', 'Min Safe Stock', 'Max Safe Stock', 'Status', 'Active Batches'];
    const rows = filteredInventory.map((item) => {
      const status = item.currentStock <= 0 ? 'OUT_OF_STOCK' : item.isLowStock ? 'LOW_STOCK' : 'HEALTHY';
      return [
        `"${item.ingredientName}"`,
        `"${item.sku}"`,
        item.unit,
        item.currentStock,
        item.minimumStockLevel,
        item.maximumStockLevel,
        status,
        item.batches?.length || 0,
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory_stock_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const outOfStockCount = inventory.filter((i) => i.currentStock <= 0).length;
  const lowStockCount = inventory.filter((i) => i.currentStock > 0 && i.isLowStock).length;
  const totalAlerts = outOfStockCount + lowStockCount;
  const totalBatches = inventory.reduce((acc, curr) => acc + (curr.batches?.length || 0), 0);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch =
        item.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLowStock = !showLowStockOnly || item.isLowStock || item.currentStock <= 0;
      return matchesSearch && matchesLowStock;
    });
  }, [inventory, searchTerm, showLowStockOnly]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const topExpiring = expiringBatches.length > 0 ? expiringBatches[0] : null;
  const criticalLowItems = inventory.filter((i) => i.currentStock <= i.minimumStockLevel);

  return (
    <div className="view-container">
      {/* ─── 1. Friendly Executive Greeting ─────────────────────────────────── */}
      <div className="dashboard-welcome">
        <div className="welcome-text">
          <h2>{getGreeting()}, {user?.fullName?.split(' ')[0] || 'Friend'}</h2>
          <p className="welcome-sub">Here's today's inventory overview.</p>
        </div>

        <div className="welcome-actions">
          {canReceive && (
            <button
              type="button"
              data-guide-id="receive-stock-button"
              className="btn-primary"
              onClick={() => onOpenModal({ type: 'receive' })}
            >
              <PackageCheck size={16} />
              <span>+ Receive Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Clean 4-Metric Overview Row ───────────────────────────────── */}
      <div className="kpi-overview-row">
        <div className="kpi-block">
          <span className="kpi-label">Total Inventory</span>
          <span className="kpi-number">{inventory.length}</span>
          <span className="kpi-desc">Tracked items</span>
        </div>

        <div
          data-guide-id="low-stock-alert-card"
          className={`kpi-block ${totalAlerts > 0 ? 'kpi-block--warning' : ''}`}
        >
          <span className="kpi-label">Low Stock</span>
          <span className="kpi-number text-amber">{totalAlerts}</span>
          <span className="kpi-desc">
            {totalAlerts > 0 ? 'Items below safe buffer' : 'All items in safe stock'}
          </span>
        </div>

        <div className={`kpi-block ${expiringBatches.length > 0 ? 'kpi-block--danger' : ''}`}>
          <span className="kpi-label">Expiring Soon</span>
          <span className="kpi-number text-rose">{expiringBatches.length}</span>
          <span className="kpi-desc">Batches in next 7 days</span>
        </div>

        <div className="kpi-block">
          <span className="kpi-label">Active Batches</span>
          <span className="kpi-number">{totalBatches}</span>
          <span className="kpi-desc">Across all storage locations</span>
        </div>
      </div>

      {/* ─── 3. "Use These First" (FEFO Queue) ─────────────────────────────── */}
      <div className="use-first-card">
        <div className="card-header-clean">
          <div>
            <h3>Use these first</h3>
            <p className="text-secondary text-sm">
              These batches expire soonest. Use them in kitchen prep before opening newer stock (FEFO).
            </p>
          </div>
          {expiringBatches.length > 0 && (
            <span className="badge badge-amber">{expiringBatches.length} items to prioritize</span>
          )}
        </div>

        {expiringBatches.length === 0 ? (
          <div className="use-first-empty">
            <CheckCircle2 size={28} className="text-emerald" />
            <div>
              <strong>All tracked batches are fresh</strong>
              <p>No items are expiring within the next 7 days.</p>
            </div>
          </div>
        ) : (
          <div className="use-first-grid">
            {expiringBatches.slice(0, 4).map((batch) => {
              const daysRemaining = Math.max(
                0,
                Math.ceil(
                  (new Date(batch.expiryDate!).getTime() - Date.now()) / (1000 * 3600 * 24)
                )
              );
              const batchUnit =
                inventory.find((i) => i.ingredientId === batch.ingredientId)?.unit || 'units';

              const urgencyBadge =
                daysRemaining <= 2 ? 'badge-rose' : daysRemaining <= 4 ? 'badge-amber' : 'badge-emerald';

              return (
                <div key={batch.id} className="use-first-item">
                  <div className="item-top">
                    <strong className="item-name">{batch.ingredientName}</strong>
                    <span className={`badge ${urgencyBadge}`}>
                      {daysRemaining === 0 ? 'Expires today' : `Expires in ${daysRemaining} days`}
                    </span>
                  </div>

                  <div className="item-details">
                    <span className="detail-line">
                      Batch: <span className="font-mono">{batch.batchNumber}</span>
                    </span>
                    <span className="detail-line">
                      Available: <strong>{batch.quantity} {batchUnit}</strong>
                    </span>
                    <span className="detail-line">
                      Location: {batch.storageLocationName}
                    </span>
                  </div>

                  {canConsume && (
                    <button
                      type="button"
                      className="btn-use-first"
                      onClick={() =>
                        onOpenModal({
                          type: 'consume',
                          ingredientId: batch.ingredientId,
                          ingredientName: batch.ingredientName,
                          unit: batchUnit,
                          currentStock: batch.quantity,
                        })
                      }
                    >
                      <PackageMinus size={14} />
                      <span>Use First</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 4. Smart Suggestion (Quiet, helpful assistant card) ───────────── */}
      {(expiringBatches.length > 0 || criticalLowItems.length > 0) && (
        <div className="smart-suggestion-card">
          <div className="suggestion-icon">
            <Sparkles size={18} className="text-accent" />
          </div>
          <div className="suggestion-content">
            <strong>Smart suggestion</strong>
            <p>
              {expiringBatches.length > 0 && topExpiring ? (
                <>
                  Use batch <code>{topExpiring.batchNumber}</code> of <strong>{topExpiring.ingredientName}</strong> first
                  in today's prep to prevent waste.
                </>
              ) : (
                <>
                  {criticalLowItems[0]?.ingredientName} is below safe buffer. Consider creating a purchase request.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ─── 5. Stock & Batches Table ─────────────────────────────────────── */}
      <div className="table-section">
        <div className="table-header-row">
          <div>
            <h3>Stock &amp; Batches</h3>
            <p className="text-secondary text-sm">Monitor live stock levels and batch expiration dates.</p>
          </div>

          <div className="table-header-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleExportCSV}
              disabled={inventory.length === 0}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Clean Filter Toolbar */}
        <div className="filter-bar">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by ingredient or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-actions">
            <button
              type="button"
              className={`filter-chip ${showLowStockOnly ? 'active' : ''}`}
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
            >
              <AlertTriangle size={14} />
              <span>Low Stock Only ({totalAlerts})</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={fetchData}
              title="Refresh list"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Responsive Table Card */}
        <div className="table-card">
          <div className="table-responsive-wrapper">
            {loading && inventory.length === 0 ? (
              <div className="table-loading-box">
                <RefreshCw size={22} className="spin text-accent mb-2" />
                <span>Loading inventory items...</span>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="empty-box">
                <Boxes size={38} className="text-muted mb-2" />
                <h4>No items found</h4>
                <p className="text-muted text-sm">
                  {searchTerm || showLowStockOnly
                    ? 'No products matched your search or filters.'
                    : 'No inventory items registered yet.'}
                </p>
                {(searchTerm || showLowStockOnly) && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm mt-3"
                    onClick={() => {
                      setSearchTerm('');
                      setShowLowStockOnly(false);
                    }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}></th>
                    <th>Product</th>
                    <th>Current Stock</th>
                    <th>Safe Buffer</th>
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
                          <td className="expand-cell" onClick={(e) => { e.stopPropagation(); toggleExpand(item.ingredientId); }}>
                            <div className="expand-toggle">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                          </td>

                          {/* Product */}
                          <td>
                            <div className="product-title-group">
                              <strong className="product-name">{item.ingredientName}</strong>
                              <span className="product-sku font-mono">{item.sku}</span>
                            </div>
                          </td>

                          {/* Stock */}
                          <td>
                            <div className="stock-display">
                              <span className={`stock-qty ${item.currentStock <= 0 ? 'text-rose font-bold' : item.isLowStock ? 'text-amber font-bold' : ''}`}>
                                {item.currentStock.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="stock-unit">{item.unit}</span>
                            </div>
                          </td>

                          {/* Safe Buffer */}
                          <td>
                            <span className="text-secondary text-sm">
                              Min: {item.minimumStockLevel} / Max: {item.maximumStockLevel}
                            </span>
                          </td>

                          {/* Status */}
                          <td>
                            {item.currentStock <= 0 ? (
                              <span className="badge badge-rose">
                                <AlertOctagon size={12} className="inline-icon" />
                                Out of stock
                              </span>
                            ) : item.isLowStock ? (
                              <span className="badge badge-amber">
                                <AlertTriangle size={12} className="inline-icon" />
                                Low stock
                              </span>
                            ) : (
                              <span className="badge badge-emerald">
                                <CheckCircle2 size={12} className="inline-icon" />
                                Available
                              </span>
                            )}
                          </td>

                          {/* Batches */}
                          <td>
                            <span className="badge badge-default">
                              {activeBatchCount} {activeBatchCount === 1 ? 'batch' : 'batches'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="row-actions">
                              {canConsume && (
                                <button
                                  type="button"
                                  className="btn-table-action"
                                  disabled={item.currentStock <= 0}
                                  title="Consume stock (FEFO)"
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
                                  <PackageMinus size={13} />
                                  <span>Use First</span>
                                </button>
                              )}

                              {canEdit && (
                                <button
                                  type="button"
                                  className="btn-table-action"
                                  disabled={editLoading}
                                  title="Edit item specifications"
                                  onClick={() => handleOpenEdit(item)}
                                >
                                  <Pencil size={13} />
                                  <span>Edit</span>
                                </button>
                              )}

                              <button
                                type="button"
                                data-guide-id="view-history-button"
                                className="btn-table-action"
                                title="View batch history"
                                onClick={() =>
                                  onOpenModal({
                                    type: 'history',
                                    ingredientId: item.ingredientId,
                                    ingredientName: item.ingredientName,
                                    unit: item.unit,
                                    sku: item.sku,
                                  })
                                }
                              >
                                <History size={13} />
                                <span>History</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Batch Detail Row */}
                        {isExpanded && (
                          <tr className="nested-batch-row">
                            <td colSpan={7}>
                              <div className="batch-accordion-panel">
                                <div className="batch-panel-header">
                                  <strong>Batches for {item.ingredientName}</strong>
                                  <span className="text-muted text-xs">Sorted by earliest expiry (FEFO)</span>
                                </div>

                                {item.batches && item.batches.length > 0 ? (
                                  <div className="table-responsive-wrapper">
                                    <table className="nested-batch-table">
                                      <thead>
                                        <tr>
                                          <th>Batch Number</th>
                                          <th>Location</th>
                                          <th>Quantity</th>
                                          <th>Unit Cost</th>
                                          <th>Received</th>
                                          <th>Expiry</th>
                                          <th>Status</th>
                                          <th className="text-right">Actions</th>
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
                                              <td className="font-mono text-accent font-bold">
                                                {batch.batchNumber}
                                              </td>
                                              <td>
                                                <span className="location-tag">
                                                  <MapPin size={11} className="inline-icon text-muted" />
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
                                                        : 'text-secondary'
                                                    }
                                                  >
                                                    {new Date(batch.expiryDate).toLocaleDateString()}
                                                    {isExpired && ' (Expired)'}
                                                    {isSoon && ' (Soon)'}
                                                  </span>
                                                ) : (
                                                  <span className="text-muted">No expiry</span>
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
                                                  {batch.status.replace(/_/g, ' ')}
                                                </span>
                                              </td>
                                              <td className="text-right">
                                                <div className="batch-actions-row">
                                                  {batch.quantity > 0 && (
                                                    <button
                                                      type="button"
                                                      className="btn-batch-btn btn-batch-waste"
                                                      title="Record waste"
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

                                                  <button
                                                    type="button"
                                                    className="btn-batch-btn"
                                                    title="Adjust stock quantity"
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

                                                  {batch.quantity > 0 && (
                                                    <button
                                                      type="button"
                                                      className="btn-batch-btn"
                                                      title="Transfer stock to another room"
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

                                                  <button
                                                    type="button"
                                                    className="btn-batch-btn"
                                                    title="View batch history"
                                                    onClick={() =>
                                                      onOpenModal({
                                                        type: 'history',
                                                        batch,
                                                        ingredientId: item.ingredientId,
                                                        ingredientName: item.ingredientName,
                                                        unit: item.unit,
                                                        sku: item.sku,
                                                      })
                                                    }
                                                  >
                                                    <History size={12} />
                                                    <span>History</span>
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="p-4 text-muted text-sm text-center">
                                    No batches received yet for this item.
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
        </div>
      </div>

      {/* ─── 6. Simple Edit Item Modal ────────────────────────────────────── */}
      {editingIngredient && (
        <div className="modal-overlay" onClick={() => setEditingIngredient(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-title">
                <h3>Edit Item</h3>
                <p>Update specifications for {editingIngredient.name}</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingIngredient(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {editError && <div className="alert-error mx-4 mt-4">{editError}</div>}

            <form onSubmit={handleSaveEdit} className="modal-form-body">
              <div className="form-group">
                <label>Product Name</label>
                <input
                  type="text"
                  value={editIngName}
                  onChange={(e) => setEditIngName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row-2">
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
                  <label>Unit (e.g. kg, L, units)</label>
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
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Minimum Stock Level</label>
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
                  <label>Maximum Stock Level</label>
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

              <div className="modal-footer-actions">
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
