import React, { useState, useEffect, useCallback } from 'react';
import {
  PackageCheck,
  PackageMinus,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Clock,
  Truck,
  Activity,
} from 'lucide-react';
import type {
  ActiveModal,
  StockAdjustmentResponse,
  StockBatchResponse,
  InventoryResponse,
  PurchaseOrderResponse,
  StockMovementResponse,
} from '../types';
import { useAuth } from '../context/useAuth';
import { api } from '../services/api';

interface OperationsHubProps {
  onOpenModal: (modal: ActiveModal) => void;
  refreshTrigger?: number;
}

export const OperationsHub: React.FC<OperationsHubProps> = ({ onOpenModal, refreshTrigger }) => {
  const { user } = useAuth();

  // Data states
  const [loading, setLoading] = useState(false);
  const [expiringBatches, setExpiringBatches] = useState<StockBatchResponse[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryResponse[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrderResponse[]>([]);
  const [pendingAdjustments, setPendingAdjustments] = useState<StockAdjustmentResponse[]>([]);
  const [recentMovements, setRecentMovements] = useState<StockMovementResponse[]>([]);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);

  const isManager = user?.role === 'RESTAURANT_MANAGER' || user?.role === 'SYSTEM_ADMIN';
  const canReceive =
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'RESTAURANT_MANAGER' ||
    user?.role === 'INVENTORY_MANAGER';
  const canConsume =
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'RESTAURANT_MANAGER' ||
    user?.role === 'INVENTORY_MANAGER' ||
    user?.role === 'SALES_KITCHEN_STAFF';

  const loadOperationsData = useCallback(async () => {
    setLoading(true);
    try {
      const [expiring, lowStock, adjustments, movements, orders, allInventory] =
        await Promise.all([
          api.getExpiringStock(7).catch(() => []),
          api.getLowStock().catch(() => []),
          isManager ? api.getAdjustments('PENDING_APPROVAL').catch(() => []) : Promise.resolve([]),
          api.getStockMovements().catch(() => []),
          api.getPurchaseOrders().catch(() => []),
          api.getInventory().catch(() => []),
        ]);

      setExpiringBatches(expiring);
      setLowStockItems(lowStock);
      setPendingAdjustments(adjustments);
      setRecentMovements(movements.slice(0, 6));
      setPendingOrders(orders.filter((o) => ['ORDERED', 'PENDING_APPROVAL', 'PARTIALLY_RECEIVED'].includes(o.status)));
      setTotalInventoryCount(allInventory.length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    void loadOperationsData();
  }, [loadOperationsData, refreshTrigger]);

  const getDaysUntil = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const diffTime = new Date(dateStr).getTime() - new Date().getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="view-container">
      {/* ─── Hero Overview ──────────────────────────────────────── */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Operations</h2>
          <p>Here&apos;s what needs attention today across kitchen, inventory, and supplier intake.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hub-role-status">
            <span className="text-muted text-xs">SHIFT OPERATOR</span>
            <strong>{user?.fullName}</strong>
            <span className="role-pill-accent">{user?.role?.replace(/_/g, ' ')}</span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadOperationsData()}
            disabled={loading}
            title="Refresh operations"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── Top 4 Operational Metrics ──────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <CheckCircle2 size={22} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Inventory Health</span>
            <span className="stat-value">
              {lowStockItems.length === 0 ? 'Healthy' : `${lowStockItems.length} Low Stock`}
            </span>
            <span className="stat-subtext">
              {totalInventoryCount > 0 ? `${totalInventoryCount} tracked ingredients` : 'Pantry active'}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <Truck size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Orders</span>
            <span className="stat-value">{pendingOrders.length}</span>
            <span className="stat-subtext">Awaiting delivery / intake</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-amber-glow">
            <Clock size={22} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Expiring Soon</span>
            <span className="stat-value">{expiringBatches.length} items</span>
            <span className="stat-subtext">Prioritize via FEFO</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-purple-glow">
            <ShieldAlert size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Manager Sign-offs</span>
            <span className="stat-value">{pendingAdjustments.length}</span>
            <span className="stat-subtext">Stock adjustments &ge; 10 units</span>
          </div>
        </div>
      </div>

      {/* ─── Today's Priorities ("Today's Attention") ───────────── */}
      <div className="operations-priority-section">
        <div className="section-header-row mb-3">
          <div>
            <h3 className="section-title">Today&apos;s Attention</h3>
            <p className="text-xs text-muted">Immediate action items required for kitchen and stock integrity.</p>
          </div>
          <span className="badge badge-amber">
            {expiringBatches.length + lowStockItems.length + pendingAdjustments.length} priorities
          </span>
        </div>

        <div className="priority-cards-grid">
          {/* 1. First Expiring Batch */}
          {expiringBatches.length > 0 ? (
            expiringBatches.slice(0, 2).map((batch) => {
              const days = getDaysUntil(batch.expiryDate);
              return (
                <div className="priority-card priority-card--amber" key={batch.id}>
                  <div className="priority-card-icon">
                    <Clock size={20} className="text-amber" />
                  </div>
                  <div className="priority-card-info">
                    <div className="flex items-center gap-2">
                      <strong>{batch.ingredientName}</strong>
                      <span className="font-mono text-xs text-muted">Lot: {batch.batchNumber}</span>
                    </div>
                    <p className="priority-card-desc">
                      {days !== null && days <= 0
                        ? '⚠️ Expired today — deplete or log waste immediately.'
                        : `Expires in ${days} day(s) · Batch quantity: ${batch.quantity}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => onOpenModal({ type: 'consume', ingredientId: batch.ingredientId })}
                  >
                    Use First (FEFO)
                  </button>
                </div>
              );
            })
          ) : (
            <div className="priority-card priority-card--clean">
              <CheckCircle2 size={18} className="text-emerald" />
              <div className="priority-card-info">
                <strong>FEFO Batches in Good Standing</strong>
                <p className="priority-card-desc">No batches are within critical 48h expiration window.</p>
              </div>
            </div>
          )}

          {/* 2. Low Stock Alerts */}
          {lowStockItems.slice(0, 2).map((item) => (
            <div className="priority-card priority-card--rose" key={item.ingredientId}>
              <div className="priority-card-icon">
                <AlertTriangle size={20} className="text-rose" />
              </div>
              <div className="priority-card-info">
                <strong>{item.ingredientName}</strong>
                <p className="priority-card-desc">
                  Low stock · Current: <strong>{item.currentStock} {item.unit}</strong> (Min buffer: {item.minimumStockLevel} {item.unit})
                </p>
              </div>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => onOpenModal({ type: 'receive', ingredientId: item.ingredientId })}
                disabled={!canReceive}
              >
                + Receive Stock
              </button>
            </div>
          ))}

          {/* 3. Pending Adjustments */}
          {isManager && pendingAdjustments.length > 0 && (
            <div className="priority-card priority-card--purple">
              <div className="priority-card-icon">
                <ShieldAlert size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <div className="priority-card-info">
                <strong>{pendingAdjustments.length} Stock Adjustments Pending Sign-off</strong>
                <p className="priority-card-desc">
                  Changes &ge; 10 units awaiting Restaurant Manager approval.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => {
                  const first = pendingAdjustments[0];
                  onOpenModal({ type: 'approveAdjustment', adjustmentId: first.id, adjustment: first });
                }}
              >
                Review First
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Quick Actions Grid ─────────────────────────────────── */}
      <div className="section-header-row mt-6 mb-3">
        <div>
          <h3 className="section-title">Quick Operations</h3>
          <p className="text-xs text-muted">Primary transactions governed by First-Expired, First-Out (FEFO) rules.</p>
        </div>
      </div>

      <div className="ops-grid">
        {/* Receive Stock */}
        <div className={`ops-card ${!canReceive ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-blue-glow">
              <PackageCheck size={22} className="text-blue" />
            </div>
            <div className="ops-tag">INTAKE</div>
          </div>
          <h3>Receive Inward Stock</h3>
          <p>
            Register supplier shipments, lot numbers, storage locations, unit costs, and expiration dates.
          </p>
          <div className="ops-footer">
            <button
              type="button"
              data-guide-id="receive-stock-button"
              className="btn-primary w-full"
              disabled={!canReceive}
              onClick={() => onOpenModal({ type: 'receive' })}
            >
              + Receive Stock
            </button>
            {!canReceive && (
              <span className="text-xs text-rose mt-1 block">Requires Manager or Storekeeper role</span>
            )}
          </div>
        </div>

        {/* FEFO Usage */}
        <div className={`ops-card ${!canConsume ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-emerald-glow">
              <PackageMinus size={22} className="text-emerald" />
            </div>
            <div className="ops-tag">FEFO DEPLETION</div>
          </div>
          <h3>Use Stock in Kitchen</h3>
          <p>
            Deduct ingredient portions. The system automatically depletes earliest expiring batches first.
          </p>
          <div className="ops-footer">
            <button
              type="button"
              data-guide-id="consume-stock-button"
              className="btn-primary w-full"
              disabled={!canConsume}
              onClick={() => onOpenModal({ type: 'consume' })}
            >
              Use Stock (FEFO)
            </button>
          </div>
        </div>

        {/* Record Waste */}
        <div className="ops-card">
          <div className="ops-card-header">
            <div className="ops-icon-box bg-rose-glow">
              <Trash2 size={22} className="text-rose" />
            </div>
            <div className="ops-tag">SPOILAGE</div>
          </div>
          <h3>Record Spoilage & Waste</h3>
          <p>
            Record expired, damaged, or over-prepped items directly against specific stock batches.
          </p>
          <div className="ops-footer">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => onOpenModal({ type: 'consume' })}
            >
              Log Waste Record
            </button>
          </div>
        </div>

        {/* Manager Review */}
        <div className={`ops-card ${!isManager ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-purple-glow">
              <ShieldAlert size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="ops-tag">
              {pendingAdjustments.length > 0 ? `${pendingAdjustments.length} PENDING` : 'GATEWAY'}
            </div>
          </div>
          <h3>Manager Adjustment Review</h3>
          <p>
            Adjustments &ge; 10 units require managerial sign-off before warehouse quantity is updated.
          </p>
          <div className="ops-footer">
            {pendingAdjustments.length > 0 ? (
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => {
                  const first = pendingAdjustments[0];
                  onOpenModal({ type: 'approveAdjustment', adjustmentId: first.id, adjustment: first });
                }}
              >
                Review Pending ({pendingAdjustments.length})
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary w-full"
                disabled
              >
                No Pending Approvals
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Recent Operations Activity Feed ────────────────────── */}
      <div className="table-card mt-6 p-4">
        <div className="panel-heading mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-accent" />
            <h3 style={{ margin: 0 }}>Recent Warehouse Activity Feed</h3>
          </div>
          <span className="text-xs text-muted">Audited stock movements</span>
        </div>

        {recentMovements.length === 0 ? (
          <div className="empty-state py-6">
            <p className="text-sm text-muted">No recent stock movements recorded yet today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentMovements.map((move) => (
              <div className="activity-feed-row" key={move.id}>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`activity-pill ${
                      move.movementType === 'RECEIPT' || move.movementType === 'TRANSFER_IN'
                        ? 'activity-pill--in'
                        : move.movementType === 'WASTE'
                        ? 'activity-pill--waste'
                        : 'activity-pill--out'
                    }`}
                  >
                    {move.movementType}
                  </span>
                  <strong className="text-sm">{move.ingredientName}</strong>
                  <span className="text-xs font-mono text-muted">Batch: {move.batchNumber}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-primary">
                    {move.quantity > 0 ? `+${move.quantity}` : move.quantity} {move.unit}
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(move.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
