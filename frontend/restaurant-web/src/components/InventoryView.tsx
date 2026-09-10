import React, { useEffect, useState } from 'react';
import {
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
  PlusCircle,
  RefreshCw,
  Search,
  Sliders,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  ActiveModal,
  InventoryResponse,
  StockBatchResponse,
} from '../types';
import { useAuth } from '../context/useAuth';

interface InventoryViewProps {
  onOpenModal: (modal: ActiveModal) => void;
  refreshTrigger: number;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onOpenModal,
  refreshTrigger,
}) => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<StockBatchResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [expandedIngredients, setExpandedIngredients] = useState<Record<string, boolean>>({});

  const canReceive = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER';
  const canConsume = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER' || user?.role === 'SALES_KITCHEN_STAFF';

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

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = !showLowStockOnly || item.isLowStock;
    return matchesSearch && matchesLowStock;
  });

  const lowStockCount = inventory.filter((i) => i.isLowStock).length;
  const totalBatches = inventory.reduce((acc, curr) => acc + (curr.batches?.length || 0), 0);

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

        <div className={`stat-card ${lowStockCount > 0 ? 'stat-warning' : ''}`}>
          <div className="stat-icon-wrapper bg-amber-glow">
            <AlertTriangle size={24} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Low Stock Alerts</span>
            <span className="stat-value">{lowStockCount}</span>
            <span className="stat-subtext">Below threshold level</span>
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
            <span>Low Stock Only ({lowStockCount})</span>
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
          {canReceive && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onOpenModal({ type: 'receive' })}
            >
              <PlusCircle size={16} />
              <span>Receive Stock</span>
            </button>
          )}

          {canConsume && (
            <button
              type="button"
              className="btn-secondary"
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
                        <span className={`stock-number ${item.isLowStock ? 'text-amber font-bold' : ''}`}>
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
                        {item.isLowStock ? (
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
                          {canReceive && (
                            <button
                              type="button"
                              className="btn-table-action"
                              title="Receive new batch for this item"
                              onClick={() =>
                                onOpenModal({
                                  type: 'receive',
                                  ingredientId: item.ingredientId,
                                })
                              }
                            >
                              <PlusCircle size={14} />
                              <span>Receive</span>
                            </button>
                          )}
                          {canConsume && (
                            <button
                              type="button"
                              className="btn-table-action"
                              title="Consume stock (FEFO)"
                              onClick={() =>
                                onOpenModal({
                                  type: 'consume',
                                  ingredientId: item.ingredientId,
                                })
                              }
                            >
                              <PackageMinus size={14} />
                              <span>Consume</span>
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
    </div>
  );
};
