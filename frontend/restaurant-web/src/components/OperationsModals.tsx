import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Info,
  PackageCheck,
  PackageMinus,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  ActiveModal,
  IngredientResponse,
  InventoryResponse,
  StorageLocationResponse,
} from '../types';

interface OperationsModalsProps {
  modal: ActiveModal;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const OperationsModals: React.FC<OperationsModalsProps> = ({
  modal,
  onClose,
  onSuccess,
}) => {
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryResponse[]>([]);
  const [locations, setLocations] = useState<StorageLocationResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy initial state based on active modal
  const initialIngredientId = (modal && 'ingredientId' in modal && modal.ingredientId) ? modal.ingredientId : '';
  const initialBatch = (modal && 'batch' in modal && modal.batch) ? modal.batch : null;

  const [receiveIngredientId, setReceiveIngredientId] = useState<string>(initialIngredientId);
  const [receiveLocationId, setReceiveLocationId] = useState<string>('');
  const [receiveBatchNumber, setReceiveBatchNumber] = useState<string>(
    () => `BAT-${Math.floor(10000 + Math.random() * 90000)}`
  );
  const [receiveQuantity, setReceiveQuantity] = useState<string>('20');
  const [receiveUnitCost, setReceiveUnitCost] = useState<string>('5.50');
  const [receiveExpiryDate, setReceiveExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });

  // Consume
  const [consumeIngredientId, setConsumeIngredientId] = useState<string>(initialIngredientId);
  const [consumeQuantity, setConsumeQuantity] = useState<string>(() => {
    if (modal && modal.type === 'consume' && modal.currentStock && modal.currentStock > 0) {
      return Math.min(5, modal.currentStock).toString();
    }
    return '5';
  });
  const [consumeReason, setConsumeReason] = useState<string>('Kitchen Lunch Prep');
  const [consumeRefType, setConsumeRefType] = useState<string>('KITCHEN_ORDER');

  // Waste
  const [wasteQuantity, setWasteQuantity] = useState<string>(
    initialBatch ? Math.min(1, initialBatch.quantity).toString() : '1'
  );
  const [wasteReason, setWasteReason] = useState<string>('Spoiled / damaged during handling');

  // Adjust
  const [adjustQuantityChange, setAdjustQuantityChange] = useState<string>('5');
  const [adjustReason, setAdjustReason] = useState<string>('Inventory count discrepancy reconciliation');

  // Transfer
  const [transferDestinationId, setTransferDestinationId] = useState<string>('');
  const [transferQuantity, setTransferQuantity] = useState<string>(
    initialBatch ? Math.min(2, initialBatch.quantity).toString() : '2'
  );

  // Approval testing
  const [approvalAdjustmentId, setApprovalAdjustmentId] = useState<string>(
    modal && modal.type === 'approveAdjustment' ? modal.adjustmentId : ''
  );

  useEffect(() => {
    let ignore = false;
    api.getIngredients().then((data) => {
      if (!ignore) setIngredients(data);
    }).catch(console.error);

    api.getInventory().then((invData) => {
      if (!ignore) setInventoryList(invData);
    }).catch(console.error);

    api.getStorageLocations().then((locs) => {
      if (!ignore) {
        const active = locs.filter((l) => l.isActive);
        setLocations(active);
        if (active.length > 0) {
          setReceiveLocationId((prev) => prev || active[0].id);
        }
      }
    }).catch(console.error);

    return () => {
      ignore = true;
    };
  }, []);

  if (!modal) return null;

  // Active ingredient item context for consume
  const targetIngredientId =
    modal.type === 'consume' && modal.ingredientId
      ? modal.ingredientId
      : consumeIngredientId;

  const currentConsumeItem = inventoryList.find(
    (i) => i.ingredientId === targetIngredientId
  );

  const availableStock = currentConsumeItem
    ? currentConsumeItem.currentStock
    : modal.type === 'consume'
    ? modal.currentStock
    : undefined;

  const itemUnit = currentConsumeItem
    ? currentConsumeItem.unit
    : modal.type === 'consume' && modal.unit
    ? modal.unit
    : ingredients.find((i) => i.id === targetIngredientId)?.unit || '';

  const itemName = currentConsumeItem
    ? currentConsumeItem.ingredientName
    : modal.type === 'consume' && modal.ingredientName
    ? modal.ingredientName
    : ingredients.find((i) => i.id === targetIngredientId)?.name || '';

  const itemSku = currentConsumeItem
    ? currentConsumeItem.sku
    : modal.type === 'consume' && modal.sku
    ? modal.sku
    : ingredients.find((i) => i.id === targetIngredientId)?.sku || '';

  // Handlers
  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveIngredientId || !receiveLocationId) {
      setError('Please select an ingredient and storage location.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.receiveStock({
        ingredientId: receiveIngredientId,
        storageLocationId: receiveLocationId,
        batchNumber: receiveBatchNumber.trim(),
        quantity: parseFloat(receiveQuantity),
        unitCost: parseFloat(receiveUnitCost),
        expiryDate: receiveExpiryDate ? new Date(receiveExpiryDate).toISOString() : null,
      });
      onSuccess(res.message || 'Stock batch received successfully!');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to receive stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleConsumeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIngredientId) {
      setError('Please select an ingredient to consume.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.consumeStock({
        ingredientId: targetIngredientId,
        quantity: parseFloat(consumeQuantity),
        reason: consumeReason,
        referenceType: consumeRefType,
      });
      onSuccess(res.message || 'Stock consumed via FEFO algorithm!');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to consume stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.type !== 'waste' || !modal.batch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.recordWaste({
        stockBatchId: modal.batch.id,
        quantity: parseFloat(wasteQuantity),
        reason: wasteReason,
      });
      onSuccess(res.message || 'Waste recorded successfully.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record waste.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.type !== 'adjust' || !modal.batch) return;
    const qtyChange = parseFloat(adjustQuantityChange);
    if (qtyChange === 0) {
      setError('Adjustment quantity cannot be 0.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.adjustStock({
        stockBatchId: modal.batch.id,
        quantityChange: qtyChange,
        reason: adjustReason,
      });
      const adjIdNote = res.adjustmentId ? ` [ID: ${res.adjustmentId.slice(0, 8)}...]` : '';
      const thresholdNote =
        Math.abs(qtyChange) >= 10
          ? ` (Significant adjustment ≥ 10 marked PENDING_APPROVAL${adjIdNote})`
          : ' (Auto-applied immediately)';
      onSuccess((res.message || 'Stock adjustment submitted!') + thresholdNote);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit stock adjustment.');
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.type !== 'transfer' || !modal.batch || !transferDestinationId) {
      setError('Please select a destination storage location.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.transferStock({
        stockBatchId: modal.batch.id,
        destinationStorageLocationId: transferDestinationId,
        quantity: parseFloat(transferQuantity),
      });
      onSuccess(res.message || 'Stock transferred to new location successfully.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer stock.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAdjustment = async (approve: boolean) => {
    if (!approvalAdjustmentId) return;
    setLoading(true);
    setError(null);
    try {
      if (approve) {
        const res = await api.approveAdjustment(approvalAdjustmentId);
        onSuccess(res.message || 'Stock adjustment approved and applied.');
      } else {
        const res = await api.rejectAdjustment(approvalAdjustmentId);
        onSuccess(res.message || 'Stock adjustment rejected.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process adjustment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* RECEIVE MODAL */}
        {modal.type === 'receive' && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <PackageCheck size={22} className="text-blue" />
              </div>
              <div>
                <h3>Receive Stock Batch</h3>
                <p>Register incoming inventory shipment into a storage location</p>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleReceiveSubmit} className="modal-form">
              <div className="form-group">
                <label>Ingredient</label>
                <select
                  value={receiveIngredientId}
                  onChange={(e) => setReceiveIngredientId(e.target.value)}
                  required
                >
                  <option value="">-- Select Ingredient --</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.sku}) - {i.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Storage Location</label>
                <select
                  value={receiveLocationId}
                  onChange={(e) => setReceiveLocationId(e.target.value)}
                  required
                >
                  <option value="">-- Select Location --</option>
                  {locations
                    .filter((loc) => loc.isActive)
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.temperatureType ? `(${loc.temperatureType})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Batch Number</label>
                  <input
                    type="text"
                    value={receiveBatchNumber}
                    onChange={(e) => setReceiveBatchNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={receiveQuantity}
                    onChange={(e) => setReceiveQuantity(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={receiveUnitCost}
                    onChange={(e) => setReceiveUnitCost(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Expiry Date</label>
                  <input
                    type="date"
                    value={receiveExpiryDate}
                    onChange={(e) => setReceiveExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Processing...' : 'Receive Stock'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* CONSUME MODAL */}
        {modal.type === 'consume' && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-emerald-glow">
                <PackageMinus size={22} className="text-emerald" />
              </div>
              <div>
                <h3>Consume Stock (FEFO)</h3>
                <p>Depletes stock using First-Expired, First-Out automatic batch selection</p>
              </div>
            </div>

            <div className="info-banner mb-4">
              <Info size={16} className="text-accent" />
              <span>
                The backend automatically selects batches expiring earliest. If an expiry date is
                missing, oldest received batches are consumed first.
              </span>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleConsumeSubmit} className="modal-form">
              {modal.ingredientId ? (
                <div className="batch-context-summary mb-4">
                  <div>
                    <span>Ingredient:</span>{' '}
                    <strong className="text-white">{itemName || 'Target Ingredient'}</strong>
                  </div>
                  {itemSku && (
                    <div>
                      <span>SKU:</span>{' '}
                      <strong className="font-mono text-accent">{itemSku}</strong>
                    </div>
                  )}
                  <div>
                    <span>Available Stock:</span>{' '}
                    <strong
                      className={
                        availableStock !== undefined && availableStock <= 0
                          ? 'text-rose font-bold'
                          : 'text-emerald font-bold'
                      }
                    >
                      {availableStock !== undefined
                        ? availableStock.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })
                        : '—'}{' '}
                      {itemUnit}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label>Select Ingredient</label>
                  <select
                    value={consumeIngredientId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setConsumeIngredientId(nextId);
                      const item = inventoryList.find((i) => i.ingredientId === nextId);
                      if (item && item.currentStock > 0) {
                        setConsumeQuantity((prev) => {
                          const num = parseFloat(prev);
                          if (isNaN(num) || num <= 0 || num > item.currentStock) {
                            return Math.min(5, item.currentStock).toString();
                          }
                          return prev;
                        });
                      }
                    }}
                    required
                  >
                    <option value="">-- Select Ingredient to Deplete --</option>
                    {(inventoryList.length > 0
                      ? inventoryList
                      : ingredients.map((i) => ({
                          ingredientId: i.id,
                          ingredientName: i.name,
                          sku: i.sku,
                          unit: i.unit,
                          currentStock: 0,
                          isLowStock: false,
                        }))
                    ).map((i) => (
                      <option key={i.ingredientId} value={i.ingredientId}>
                        {i.ingredientName} ({i.sku}) — Available: {i.currentStock.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} {i.unit}
                      </option>
                    ))}
                  </select>

                  {/* Live Available Stock Badge Card when selected from dropdown */}
                  {currentConsumeItem && (
                    <div className="batch-context-summary mt-2">
                      <div>
                        <span>Selected:</span>{' '}
                        <strong className="text-white">{currentConsumeItem.ingredientName}</strong>
                      </div>
                      <div>
                        <span>SKU:</span>{' '}
                        <strong className="font-mono text-accent">{currentConsumeItem.sku}</strong>
                      </div>
                      <div>
                        <span>Available Stock:</span>{' '}
                        <strong
                          className={
                            currentConsumeItem.currentStock <= 0
                              ? 'text-rose font-bold'
                              : currentConsumeItem.isLowStock
                              ? 'text-amber font-bold'
                              : 'text-emerald font-bold'
                          }
                        >
                          {currentConsumeItem.currentStock.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}{' '}
                          {currentConsumeItem.unit}
                          {currentConsumeItem.currentStock <= 0 && ' (OUT OF STOCK)'}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>
                    Quantity to Consume {itemUnit ? `(${itemUnit})` : ''}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableStock && availableStock > 0 ? availableStock : undefined}
                    value={consumeQuantity}
                    onChange={(e) => setConsumeQuantity(e.target.value)}
                    required
                  />
                  {availableStock !== undefined && availableStock <= 0 && (
                    <span className="text-xs text-rose mt-1 block">
                      Warning: Available stock is 0. Depletion may fail on the server.
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label>Reference Type</label>
                  <select
                    value={consumeRefType}
                    onChange={(e) => setConsumeRefType(e.target.value)}
                  >
                    <option value="KITCHEN_ORDER">Kitchen Order / Prep</option>
                    <option value="RECIPE_DISPATCH">Recipe Dispatch</option>
                    <option value="CATERING_EVENT">Catering Event</option>
                    <option value="MANUAL_CONSUMPTION">Manual Consumption</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Reason / Kitchen Notes</label>
                <input
                  type="text"
                  value={consumeReason}
                  onChange={(e) => setConsumeReason(e.target.value)}
                  placeholder="e.g. Lunch shift burger prep"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Deducting via FEFO...' : 'Confirm Consumption'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* WASTE MODAL */}
        {modal.type === 'waste' && modal.batch && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <Trash2 size={22} className="text-rose" />
              </div>
              <div>
                <h3>Record Waste / Spoilage</h3>
                <p>
                  Deduct ruined stock from Batch{' '}
                  <strong className="font-mono text-accent">{modal.batch.batchNumber}</strong>
                </p>
              </div>
            </div>

            <div className="batch-context-summary">
              <div>
                <span>Item:</span> <strong>{modal.ingredientName}</strong>
              </div>
              <div>
                <span>Location:</span> <strong>{modal.batch.storageLocationName}</strong>
              </div>
              <div>
                <span>Available:</span> <strong>{modal.batch.quantity}</strong>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleWasteSubmit} className="modal-form">
              <div className="form-group">
                <label>Quantity Wasted</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={modal.batch.quantity}
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Reason for Waste</label>
                <input
                  type="text"
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  placeholder="e.g. Expired shelf life, temperature fluctuation"
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-danger" disabled={loading}>
                  {loading ? 'Recording Waste...' : 'Confirm Waste Entry'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ADJUST MODAL */}
        {modal.type === 'adjust' && modal.batch && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-amber-glow">
                <Sliders size={22} className="text-amber" />
              </div>
              <div>
                <h3>Stock Discrepancy Adjustment</h3>
                <p>
                  Adjust count on Batch{' '}
                  <strong className="font-mono text-accent">{modal.batch.batchNumber}</strong>
                </p>
              </div>
            </div>

            <div className="batch-context-summary">
              <div>
                <span>Item:</span> <strong>{modal.ingredientName}</strong>
              </div>
              <div>
                <span>Current Quantity:</span> <strong>{modal.batch.quantity}</strong>
              </div>
            </div>

            {/* Threshold Notice Card */}
            {Math.abs(parseFloat(adjustQuantityChange) || 0) >= 10 ? (
              <div className="alert-warning mb-4">
                <AlertTriangle size={18} />
                <div>
                  <strong>Significant Adjustment (≥ 10 units):</strong>
                  <p className="text-sm">
                    This adjustment will NOT alter stock immediately. It will be submitted for
                    Restaurant Manager approval.
                  </p>
                </div>
              </div>
            ) : (
              <div className="info-banner mb-4">
                <CheckCircle2 size={18} className="text-emerald" />
                <div>
                  <strong>Routine Adjustment (&lt; 10 units):</strong>
                  <p className="text-sm">
                    This adjustment will be approved and applied immediately to the batch.
                  </p>
                </div>
              </div>
            )}

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleAdjustSubmit} className="modal-form">
              <div className="form-group">
                <label>
                  Quantity Change (+ to increase, - to decrease)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustQuantityChange}
                  onChange={(e) => setAdjustQuantityChange(e.target.value)}
                  required
                />
                <span className="text-xs text-muted mt-1">
                  New resulting batch quantity:{' '}
                  <strong>
                    {Math.max(
                      0,
                      modal.batch.quantity + (parseFloat(adjustQuantityChange) || 0)
                    ).toFixed(2)}
                  </strong>
                </span>
              </div>

              <div className="form-group">
                <label>Mandatory Audit Reason</label>
                <textarea
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="State reason for discrepancy found during count..."
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Adjustment'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TRANSFER MODAL */}
        {modal.type === 'transfer' && modal.batch && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <ArrowDownUp size={22} className="text-blue" />
              </div>
              <div>
                <h3>Transfer Stock Between Locations</h3>
                <p>
                  Move quantity from{' '}
                  <strong className="text-accent">{modal.batch.storageLocationName}</strong> to
                  another storage spot
                </p>
              </div>
            </div>

            <div className="batch-context-summary">
              <div>
                <span>Item:</span> <strong>{modal.ingredientName}</strong>
              </div>
              <div>
                <span>Source Batch:</span>{' '}
                <strong className="font-mono">{modal.batch.batchNumber}</strong>
              </div>
              <div>
                <span>Max Available:</span> <strong>{modal.batch.quantity}</strong>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            <form onSubmit={handleTransferSubmit} className="modal-form">
              <div className="form-group">
                <label>Destination Storage Location</label>
                <select
                  value={transferDestinationId}
                  onChange={(e) => setTransferDestinationId(e.target.value)}
                  required
                >
                  <option value="">-- Select Destination Location --</option>
                  {locations
                    .filter((l) => l.isActive && l.id !== modal.batch?.storageLocationId)
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.temperatureType || 'AMBIENT'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Quantity to Transfer</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={modal.batch.quantity}
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Moving Stock...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* APPROVE/REJECT ADJUSTMENT MODAL */}
        {modal.type === 'approveAdjustment' && (
          <div>
            <div className="modal-header">
              <div className="modal-icon-badge bg-purple-glow">
                <CheckCircle2 size={22} className="text-accent" />
              </div>
              <div>
                <h3>Manager Adjustment Review</h3>
                <p>Approve or Reject a pending stock adjustment</p>
              </div>
            </div>

            {error && <div className="alert-error mb-4">{error}</div>}

            {modal.adjustment && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>{modal.adjustment.ingredientName}</span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      background: modal.adjustment.quantityChange > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: modal.adjustment.quantityChange > 0 ? 'var(--emerald, #10b981)' : 'var(--rose, #ef4444)',
                      border: `1px solid ${modal.adjustment.quantityChange > 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                    }}
                  >
                    {modal.adjustment.quantityChange > 0 ? `+${modal.adjustment.quantityChange}` : modal.adjustment.quantityChange} units
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Batch: <strong style={{ color: 'var(--text-main, #e2e8f0)', fontFamily: 'monospace' }}>{modal.adjustment.batchNumber}</strong>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Reason: <span style={{ color: 'var(--text-main, #e2e8f0)' }}>&ldquo;{modal.adjustment.reason}&rdquo;</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Requested by: <strong>{modal.adjustment.requestedByName}</strong> • {new Date(modal.adjustment.createdAt).toLocaleString()}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Adjustment ID (GUID)</label>
              <input
                type="text"
                value={approvalAdjustmentId}
                onChange={(e) => setApprovalAdjustmentId(e.target.value)}
                placeholder="Enter stock adjustment GUID..."
                required
              />
            </div>

            <div className="modal-actions mt-4">
              <button
                type="button"
                className="btn-danger"
                disabled={loading || !approvalAdjustmentId}
                onClick={() => handleApproveAdjustment(false)}
              >
                Reject Adjustment
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={loading || !approvalAdjustmentId}
                onClick={() => handleApproveAdjustment(true)}
              >
                Approve & Apply Stock
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
