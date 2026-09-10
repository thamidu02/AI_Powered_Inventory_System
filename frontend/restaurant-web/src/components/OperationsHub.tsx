import React, { useState } from 'react';
import {
  PackageCheck,
  PackageMinus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ActiveModal } from '../types';
import { useAuth } from '../context/useAuth';

interface OperationsHubProps {
  onOpenModal: (modal: ActiveModal) => void;
}

export const OperationsHub: React.FC<OperationsHubProps> = ({ onOpenModal }) => {
  const { user } = useAuth();
  const [testAdjId, setTestAdjId] = useState('');

  const isManager = user?.role === 'RESTAURANT_MANAGER' || user?.role === 'SYSTEM_ADMIN';
  const canReceive = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER';
  const canConsume = user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER' || user?.role === 'INVENTORY_MANAGER' || user?.role === 'SALES_KITCHEN_STAFF';

  return (
    <div className="view-container">
      {/* Overview Banner */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Inventory Operations & Business Logic Hub</h2>
          <p>
            Execute real-time warehouse transactions. All actions are governed by strict backend rules
            including First-Expired First-Out (FEFO) depletion and managerial threshold gates.
          </p>
        </div>
        <div className="hub-role-status">
          <span className="text-muted text-xs">LOGGED IN AS</span>
          <strong>{user?.fullName}</strong>
          <span className="role-pill-accent">{user?.role}</span>
        </div>
      </div>

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
              className="btn-primary w-full"
              disabled={!canReceive}
              onClick={() => onOpenModal({ type: 'receive' })}
            >
              Open Receive Form
            </button>
            {!canReceive && (
              <span className="text-xs text-rose mt-1 block">Requires Manager or Admin role</span>
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

        {/* 4. Manager Approval Testing */}
        <div className={`ops-card ${!isManager ? 'ops-card-disabled' : ''}`}>
          <div className="ops-card-header">
            <div className="ops-icon-box bg-purple-glow">
              <ShieldAlert size={24} className="text-accent" />
            </div>
            <div className="ops-tag">2-TIER WORKFLOW</div>
          </div>
          <h3>Manager Adjustment Review</h3>
          <p>
            Review adjustments &ge; 10 units requiring manager sign-off before inventory quantity is modified.
          </p>
          <div className="ops-footer">
            <div className="input-group mb-2">
              <input
                type="text"
                className="input-sm font-mono"
                placeholder="Adjustment GUID..."
                value={testAdjId}
                onChange={(e) => setTestAdjId(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!isManager || !testAdjId}
              onClick={() => onOpenModal({ type: 'approveAdjustment', adjustmentId: testAdjId })}
            >
              Review Adjustment
            </button>
            {!isManager && (
              <span className="text-xs text-rose mt-1 block">Requires RESTAURANT_MANAGER role</span>
            )}
          </div>
        </div>
      </div>

      {/* Business Logic Deep-Dive Explainer Card */}
      <div className="logic-explainer-card">
        <div className="explainer-header">
          <Sparkles size={20} className="text-accent" />
          <h3>How the Backend Implements Core Logic</h3>
        </div>
        <div className="explainer-columns">
          <div className="explainer-col">
            <h4>1. FEFO Automated Depletion</h4>
            <p className="text-sm text-muted">
              When consumption is submitted, the API queries unexpired batches ordered by:
            </p>
            <ol className="text-xs text-muted explainer-list">
              <li>Batches with explicit ExpiryDate ascending (earliest first)</li>
              <li>Batches with null ExpiryDate sorted by ReceivedDate</li>
              <li>Iteratively deducts until remaining request = 0</li>
              <li>Updates batch status: DEPLETED if quantity is 0</li>
            </ol>
          </div>

          <div className="explainer-col">
            <h4>2. Stock Adjustment Threshold</h4>
            <p className="text-sm text-muted">
              Stock adjustments protect against discrepancies:
            </p>
            <ul className="text-xs text-muted explainer-list">
              <li>
                <strong>&lt; 10 units:</strong> Applied instantly to batch quantity + written to audit ledger.
              </li>
              <li>
                <strong>&ge; 10 units:</strong> Marked <code>PENDING_APPROVAL</code>. Batch quantity is unchanged until a Manager reviews.
              </li>
            </ul>
          </div>

          <div className="explainer-col">
            <h4>3. Dual-Movement Transfers</h4>
            <p className="text-sm text-muted">
              Transferring stock creates:
            </p>
            <ul className="text-xs text-muted explainer-list">
              <li><code>TRANSFER_OUT</code> movement referencing original batch</li>
              <li>New batch created at destination location with same cost & expiry</li>
              <li><code>TRANSFER_IN</code> movement referencing new batch</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
