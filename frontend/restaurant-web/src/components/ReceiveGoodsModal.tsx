import React, { useEffect, useState } from 'react';
import {
  PackageCheck,
  X,
  AlertTriangle,
  RefreshCw,
  Building2,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  PurchaseOrderResponse,
  PurchaseOrderItemResponse,
  StorageLocationResponse,
  CreateGoodsReceiptRequest,
  CreateGoodsReceiptItemRequest,
} from '../types';

interface ReceiveGoodsModalProps {
  order: PurchaseOrderResponse;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

interface ItemFormState {
  purchaseOrderItemId: string;
  storageLocationId: string;
  receiveQuantity: string;
  unitCost: string;
  batchNumber: string;
  expiryDate: string;
}

export const ReceiveGoodsModal: React.FC<ReceiveGoodsModalProps> = ({
  order,
  onClose,
  onSuccess,
}) => {
  const [locations, setLocations] = useState<StorageLocationResponse[]>([]);
  const [locationsLoading, setLocationsLoading] = useState<boolean>(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const [notes, setNotes] = useState<string>('');
  const [formBusy, setFormBusy] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Initialize line items state for receiving
  const [itemForms, setItemForms] = useState<Record<string, ItemFormState>>(() => {
    const initial: Record<string, ItemFormState> = {};
    const today = new Date();
    const defaultExpiry = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    order.items.forEach((item, index) => {
      const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
      // Generate unique batch number per line item
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const uniqueBatch = `BAT-${randomSuffix}-${index + 1}`;

      initial[item.id] = {
        purchaseOrderItemId: item.id,
        storageLocationId: '', // populated once locations load
        receiveQuantity: remaining > 0 ? remaining.toString() : '0',
        unitCost: item.unitPrice.toFixed(2),
        batchNumber: uniqueBatch,
        expiryDate: defaultExpiry,
      };
    });

    return initial;
  });

  // Fetch active storage locations
  useEffect(() => {
    let ignore = false;
    setLocationsLoading(true);
    setLocationsError(null);

    api.getStorageLocations()
      .then((data) => {
        if (ignore) return;
        const active = data.filter((l) => l.isActive);
        setLocations(active);

        if (active.length === 0) {
          setLocationsError('No active storage locations found. Please activate or create a storage location first.');
        } else {
          const defaultLocId = active[0].id;
          setItemForms((prev) => {
            const updated = { ...prev };
            Object.keys(updated).forEach((itemId) => {
              if (!updated[itemId].storageLocationId) {
                updated[itemId] = {
                  ...updated[itemId],
                  storageLocationId: defaultLocId,
                };
              }
            });
            return updated;
          });
        }
      })
      .catch((err) => {
        if (ignore) return;
        setLocationsError(err instanceof Error ? err.message : 'Failed to load storage locations.');
      })
      .finally(() => {
        if (!ignore) {
          setLocationsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleFieldChange = (
    itemId: string,
    field: keyof ItemFormState,
    value: string
  ) => {
    setItemForms((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleReceiveAll = () => {
    setItemForms((prev) => {
      const updated = { ...prev };
      order.items.forEach((item) => {
        const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
        if (remaining > 0 && updated[item.id]) {
          updated[item.id] = {
            ...updated[item.id],
            receiveQuantity: remaining.toString(),
          };
        }
      });
      return updated;
    });
  };

  const handleClearAll = () => {
    setItemForms((prev) => {
      const updated = { ...prev };
      order.items.forEach((item) => {
        if (updated[item.id]) {
          updated[item.id] = {
            ...updated[item.id],
            receiveQuantity: '0',
          };
        }
      });
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (locations.length === 0) {
      setModalError('Cannot receive goods without active storage locations.');
      return;
    }

    const itemsToSubmit: CreateGoodsReceiptItemRequest[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const poItem of order.items) {
      const form = itemForms[poItem.id];
      if (!form) continue;

      const remaining = Math.max(0, poItem.orderedQuantity - poItem.receivedQuantity);
      const qty = parseFloat(form.receiveQuantity) || 0;

      // Skip lines with zero quantity
      if (qty <= 0) {
        continue;
      }

      // Check if item is already fully received
      if (remaining <= 0) {
        setModalError(`Item '${poItem.ingredientName}' is already fully received.`);
        return;
      }

      // Validate quantity does not exceed remaining
      if (qty > remaining) {
        setModalError(
          `Cannot receive ${qty} ${poItem.ingredientUnit} of '${poItem.ingredientName}'. Maximum remaining quantity is ${remaining} ${poItem.ingredientUnit}.`
        );
        return;
      }

      // Validate storage location
      if (!form.storageLocationId) {
        setModalError(`Please select a storage location for '${poItem.ingredientName}'.`);
        return;
      }

      // Validate unit cost
      const cost = parseFloat(form.unitCost);
      if (isNaN(cost) || cost < 0) {
        setModalError(`Unit cost for '${poItem.ingredientName}' must be a non-negative number.`);
        return;
      }

      // Validate expiry date if provided
      if (form.expiryDate && form.expiryDate < todayStr) {
        setModalError(`Expiry date for '${poItem.ingredientName}' cannot be in the past.`);
        return;
      }

      itemsToSubmit.push({
        purchaseOrderItemId: poItem.id,
        storageLocationId: form.storageLocationId,
        receivedQuantity: qty,
        unitCost: cost,
        batchNumber: form.batchNumber.trim() || undefined,
        expiryDate: form.expiryDate ? `${form.expiryDate}T00:00:00Z` : undefined,
      });
    }

    if (itemsToSubmit.length === 0) {
      setModalError('Please specify a receive quantity greater than 0 for at least one item.');
      return;
    }

    setFormBusy(true);

    try {
      const payload: CreateGoodsReceiptRequest = {
        purchaseOrderId: order.id,
        notes: notes.trim() || undefined,
        items: itemsToSubmit,
      };

      await api.createGoodsReceipt(payload);

      const receivedCount = itemsToSubmit.length;
      onSuccess(
        `Goods receipt submitted successfully! Received ${receivedCount} ${
          receivedCount === 1 ? 'item' : 'items'
        } for PO-${order.id.substring(0, 8).toUpperCase()}. Inventory updated.`
      );
      onClose();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to submit goods receipt.');
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !formBusy && onClose()}>
      <div
        className="modal-content modal-large"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button
          type="button"
          className="modal-close"
          onClick={() => !formBusy && onClose()}
        >
          <X size={18} />
        </button>

        <div className="modal-header">
          <div className="modal-icon-badge bg-emerald-glow">
            <PackageCheck size={24} className="text-emerald" />
          </div>
          <div>
            <h3>Receive Goods</h3>
            <p className="font-mono">PO-{order.id.toUpperCase()}</p>
          </div>
        </div>

        {/* PO Context Info */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
            <span className="text-xs text-muted">Supplier</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Building2 size={13} className="text-muted" />
              <strong className="text-sm">{order.supplierName}</strong>
            </div>
          </div>

          <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
            <span className="text-xs text-muted">Order Status</span>
            <span
              className={`badge ${
                order.status === 'PARTIALLY_RECEIVED'
                  ? 'badge-amber'
                  : 'badge-blue'
              }`}
            >
              {order.status === 'PARTIALLY_RECEIVED' ? 'Partially Received' : 'Ordered'}
            </span>
          </div>

          <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
            <span className="text-xs text-muted">Expected Delivery</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Calendar size={13} className="text-muted" />
              <span className="text-sm">
                {order.expectedDeliveryDate
                  ? new Date(order.expectedDeliveryDate).toLocaleDateString()
                  : 'Not specified'}
              </span>
            </div>
          </div>
        </div>

        {modalError && (
          <div className="alert-error mb-4">
            <AlertTriangle size={18} />
            <span>{modalError}</span>
          </div>
        )}

        {locationsError && (
          <div className="alert-error mb-4">
            <AlertTriangle size={18} />
            <span>{locationsError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 className="text-sm font-bold">
              Receiving Items ({order.items.length})
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-table-action btn-batch-receive"
                onClick={handleReceiveAll}
                disabled={formBusy || locationsLoading}
                title="Fill all remaining quantities"
              >
                Receive All Remaining
              </button>
              <button
                type="button"
                className="btn-table-action"
                onClick={handleClearAll}
                disabled={formBusy || locationsLoading}
                title="Set all receive quantities to zero"
              >
                Clear Quantities
              </button>
            </div>
          </div>

          {/* Items Receiving Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
            {order.items.map((poItem: PurchaseOrderItemResponse, idx: number) => {
              const remaining = Math.max(0, poItem.orderedQuantity - poItem.receivedQuantity);
              const isFullyReceived = remaining <= 0;
              const form = itemForms[poItem.id] || {
                purchaseOrderItemId: poItem.id,
                storageLocationId: '',
                receiveQuantity: '0',
                unitCost: poItem.unitPrice.toFixed(2),
                batchNumber: '',
                expiryDate: '',
              };

              const currentQty = parseFloat(form.receiveQuantity) || 0;
              const isIncluded = currentQty > 0 && !isFullyReceived;

              return (
                <div
                  key={poItem.id}
                  style={{
                    background: isFullyReceived
                      ? 'rgba(255, 255, 255, 0.02)'
                      : isIncluded
                      ? 'rgba(16, 185, 129, 0.05)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isFullyReceived
                      ? '1px solid rgba(255, 255, 255, 0.08)'
                      : isIncluded
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Item Header & Quantitative Progress */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      marginBottom: '0.85rem',
                      paddingBottom: '0.65rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span className="text-muted text-xs font-mono">#{idx + 1}</span>
                      <strong className="text-sm" style={{ color: 'var(--text-main)', fontSize: '1rem' }}>
                        {poItem.ingredientName}
                      </strong>
                      <span className="badge badge-default">{poItem.ingredientUnit}</span>
                    </div>

                    {/* Ordered | Received | Remaining Quantities */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="text-xs">
                        <span className="text-muted">Ordered: </span>
                        <strong>{poItem.orderedQuantity}</strong>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted">Received: </span>
                        <strong className="text-blue">{poItem.receivedQuantity}</strong>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted">Remaining: </span>
                        <strong
                          style={{
                            color: isFullyReceived ? 'var(--text-muted)' : 'var(--amber)',
                            fontWeight: 700,
                          }}
                        >
                          {remaining}
                        </strong>
                      </div>
                      {isFullyReceived ? (
                        <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle2 size={11} />
                          Fully Received
                        </span>
                      ) : (
                        <span className="badge badge-amber">Awaiting Delivery</span>
                      )}
                    </div>
                  </div>

                  {/* Input Fields Row */}
                  {isFullyReceived ? (
                    <p className="text-xs text-muted" style={{ fontStyle: 'italic', margin: 0 }}>
                      All {poItem.orderedQuantity} {poItem.ingredientUnit} of this ingredient have already been received.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: '0.75rem',
                      }}
                    >
                      {/* Receive Quantity */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="text-xs">
                          Receive Qty <span className="text-rose">*</span> (max: {remaining})
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max={remaining}
                          value={form.receiveQuantity}
                          onChange={(e) =>
                            handleFieldChange(poItem.id, 'receiveQuantity', e.target.value)
                          }
                          disabled={formBusy}
                          style={{
                            borderColor:
                              parseFloat(form.receiveQuantity) > remaining
                                ? 'var(--rose)'
                                : undefined,
                          }}
                        />
                      </div>

                      {/* Storage Location */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="text-xs">
                          Storage Location <span className="text-rose">*</span>
                        </label>
                        <select
                          value={form.storageLocationId}
                          onChange={(e) =>
                            handleFieldChange(poItem.id, 'storageLocationId', e.target.value)
                          }
                          disabled={formBusy || locationsLoading || locations.length === 0}
                          required
                        >
                          {locations.length === 0 ? (
                            <option value="">No active locations</option>
                          ) : (
                            locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} {loc.temperatureType ? `(${loc.temperatureType})` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      {/* Unit Cost */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="text-xs">Unit Cost ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.unitCost}
                          onChange={(e) =>
                            handleFieldChange(poItem.id, 'unitCost', e.target.value)
                          }
                          disabled={formBusy}
                        />
                      </div>

                      {/* Batch Number */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="text-xs">Batch Number</label>
                        <input
                          type="text"
                          placeholder="e.g. BAT-12345"
                          value={form.batchNumber}
                          onChange={(e) =>
                            handleFieldChange(poItem.id, 'batchNumber', e.target.value)
                          }
                          disabled={formBusy}
                        />
                      </div>

                      {/* Expiry Date */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="text-xs">Expiry Date</label>
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={form.expiryDate}
                          onChange={(e) =>
                            handleFieldChange(poItem.id, 'expiryDate', e.target.value)
                          }
                          disabled={formBusy}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Receipt Notes */}
          <div className="form-group mb-4">
            <label className="text-xs">Receipt Notes / Delivery Remarks (Optional)</label>
            <textarea
              rows={2}
              placeholder="e.g., Delivery truck invoice #INV-9821, all packaging intact and temperature within range."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={formBusy}
            />
          </div>

          {/* Modal Actions */}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={formBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary btn-batch-receive"
              disabled={formBusy || locationsLoading || locations.length === 0}
            >
              {formBusy ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Processing Receipt...</span>
                </>
              ) : (
                <>
                  <PackageCheck size={16} />
                  <span>Confirm Goods Receipt</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
