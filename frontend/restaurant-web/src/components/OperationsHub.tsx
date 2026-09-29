import React, { useState, useEffect } from 'react';
import {
  PackageCheck,
  PackageMinus,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import type { ActiveModal, StockAdjustmentResponse } from '../types';
import { useAuth } from '../context/useAuth';
import { api } from '../services/api';

interface OperationsHubProps {
  onOpenModal: (modal: ActiveModal) => void;
  refreshTrigger?: number;
}

export const OperationsHub: React.FC<OperationsHubProps> = ({ onOpenModal, refreshTrigger }) => {
  const { user } = useAuth();
  const [testAdjId, setTestAdjId] = useState('');
  const [pendingAdjustments, setPendingAdjustments] = useState<StockAdjustmentResponse[]>([]);
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);

  const isManager = user?.role === 'RESTAURANT_MANAGER';
  const canReceive = user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER';
  const canConsume = user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER' || user?.role === 'SALES_KITCHEN_STAFF';

  const loadPendingAdjustments = async () => {
    if (!isManager) return;
    setLoadingAdjustments(true);
    try {
      const data = await api.getAdjustments('PENDING_APPROVAL');
      setPendingAdjustments(data);
    } catch {
      // ignore
    } finally {
      setLoadingAdjustments(false);
    }
  };

  useEffect(() => {
    loadPendingAdjustments();
  }, [isManager, refreshTrigger]);

  return (
    <div className="view-container">

      {/* Operations Grid */}
      <div className="ops-grid">
        {/* 1. Receive Stock */}
        <div className={`ops-card ${!canReceive ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-blue-glow">
              <PackageCheck size={24} className="text-blue" />
            </div>
            <div className="ops-tag">RECEIVE</div>
          </div>
          <h3>Receive Inward Stock</h3>
          <p>
            Register incoming shipments, assign lot/batch numbers, storage locations, unit costs, and expiration dates.
          </p>
          <div className="ops-footer">
            <button
              type="button"
              data-guide-id="receive-stock-button"
              className="btn-primary w-full"
              disabled={!canReceive}
              onClick={() => onOpenModal({ type: 'receive' })}
            >
              Open Receive Form
            </button>
            {!canReceive && (
              <span className="text-xs text-rose mt-1 block">Requires Restaurant Manager or Inventory Manager role</span>
            )}
          </div>
        </div>

        {/* 2. FEFO Consume */}
        <div className={`ops-card ${!canConsume ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-emerald-glow">
              <PackageMinus size={24} className="text-emerald" />
            </div>
            <div className="ops-tag">FEFO CONSUME</div>
          </div>
          <h3>Consume Stock (FEFO)</h3>
          <p>
            Deduct ingredient quantities. The system automatically depletes batches with the earliest expiration date first.
          </p>
          <div className="ops-footer">
            <button
              type="button"
              data-guide-id="consume-stock-button"
              className="btn-primary w-full"
              disabled={!canConsume}
              onClick={() => onOpenModal({ type: 'consume' })}
            >
              Consume via FEFO
            </button>
          </div>
        </div>

        {/* 3. Record Waste */}
        <div className="ops-card">
          <div className="ops-card-header">
            <div className="ops-icon-box bg-rose-glow">
              <Trash2 size={24} className="text-rose" />
            </div>
            <div className="ops-tag">SPOILAGE</div>
          </div>
          <h3>Record Waste & Spoilage</h3>
          <p>
            Record expired or ruined stock directly against a batch. Audit trail is captured in stock movements.
          </p>
          <div className="ops-footer">
            <span className="text-xs text-muted block mb-2">
              Tip: Click &quot;Waste&quot; next to any batch on the Stock tab to auto-select it.
            </span>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => alert('Please navigate to Stock & Batches and click Waste on the specific batch.')}
            >
              Batch Waste Instructions
            </button>
          </div>
        </div>

        {/* 4. Manager Approval Quick Trigger */}
        <div className={`ops-card ${!isManager ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-purple-glow">
              <ShieldAlert size={24} className="text-accent" />
            </div>
            <div className="ops-tag">
              {pendingAdjustments.length > 0 ? `${pendingAdjustments.length} PENDING` : 'THRESHOLD GATE'}
            </div>
          </div>
          <h3>Manager Adjustment Review</h3>
          <p>
            Adjustments &ge; 10 units require manager sign-off before batch inventory quantity is altered.
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
                Review First Pending ({pendingAdjustments.length})
              </button>
            ) : (
              <div className="input-group mb-2">
                <input
                  type="text"
                  className="input-sm font-mono"
                  placeholder="Or enter adjustment GUID..."
                  value={testAdjId}
                  onChange={(e) => setTestAdjId(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm mt-2 w-full"
                  disabled={!isManager || !testAdjId}
                  onClick={() => onOpenModal({ type: 'approveAdjustment', adjustmentId: testAdjId })}
                >
                  Review by ID
                </button>
              </div>
            )}
            {!isManager && (
              <span className="text-xs text-rose mt-1 block">Requires RESTAURANT_MANAGER role</span>
            )}
          </div>
        </div>
      </div>

      {/* PENDING ADJUSTMENTS QUEUE FOR MANAGERS */}
      {isManager && (
        <div className="logic-explainer-card mt-6">
          <div className="explainer-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-accent" />
              <div>
                <h3 style={{ margin: 0 }}>Pending Stock Adjustments Queue</h3>
                <span className="text-xs text-muted">
                  Significant adjustments (&ge; 10 units) awaiting Restaurant Manager decision
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1"
              onClick={loadPendingAdjustments}
              disabled={loadingAdjustments}
            >
              <RefreshCw size={14} className={loadingAdjustments ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingAdjustments ? (
            <div className="p-4 text-center text-muted text-sm">
              Loading pending adjustments...
            </div>
          ) : pendingAdjustments.length === 0 ? (
            <div className="p-4 text-center text-muted text-sm flex flex-col items-center justify-center gap-1">
              <CheckCircle2 size={24} className="text-emerald mb-1" />
              <strong>Queue is clear</strong>
              <span>No stock adjustments are currently pending manager approval.</span>
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              {pendingAdjustments.map((adj) => (
                <div
                  key={adj.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>{adj.ingredientName}</strong>
                      <span className="text-xs font-mono text-muted">Batch: {adj.batchNumber}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          background: adj.quantityChange > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: adj.quantityChange > 0 ? 'var(--emerald, #10b981)' : 'var(--rose, #ef4444)',
                          border: `1px solid ${adj.quantityChange > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}
                      >
                        {adj.quantityChange > 0 ? `+${adj.quantityChange}` : adj.quantityChange} units
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Reason: <span style={{ color: 'var(--text-main, #e2e8f0)' }}>&ldquo;{adj.reason}&rdquo;</span> • Requested by: <strong>{adj.requestedByName}</strong> • {new Date(adj.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary btn-sm flex items-center gap-1"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => onOpenModal({ type: 'approveAdjustment', adjustmentId: adj.id, adjustment: adj })}
                  >
                    <span>Review & Decide</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


    </div>
  );
};
