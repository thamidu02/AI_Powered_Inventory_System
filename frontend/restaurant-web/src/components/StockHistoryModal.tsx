import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Clock,
  Download,
  List,
  MapPin,
  Package,
  RefreshCw,
  Search,
  User as UserIcon,
  X,
  GitCommit,
} from 'lucide-react';
import { api } from '../services/api';
import type { StockBatchResponse, StockMovementResponse } from '../types';

interface StockHistoryModalProps {
  batch?: StockBatchResponse;
  ingredientId?: string;
  ingredientName?: string;
  unit?: string;
  sku?: string;
  onClose: () => void;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  batch,
  ingredientId,
  ingredientName,
  unit,
  sku,
  onClose,
}) => {
  const [movements, setMovements] = useState<StockMovementResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

  const targetIngredientId = ingredientId || batch?.ingredientId;
  const targetBatchId = batch?.id;
  const titleIngredient =
    ingredientName || batch?.ingredientName || (movements.length > 0 ? movements[0].ingredientName : 'Item');
  const titleUnit = unit || (movements.length > 0 ? movements[0].unit : '');
  const titleSku = sku || (movements.length > 0 ? movements[0].sku : '');

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      let data: StockMovementResponse[] = [];
      if (targetBatchId) {
        data = await api.getBatchHistory(targetBatchId);
      } else if (targetIngredientId) {
        data = await api.getIngredientHistory(targetIngredientId);
      } else {
        data = await api.getStockMovements();
      }
      setMovements(data);
    } catch (err) {
      console.error('Failed to load history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load batch history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [targetBatchId, targetIngredientId]);

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const type = (m.movementType || '').toUpperCase();
      const matchesType =
        filterType === 'ALL' ||
        (filterType === 'CONSUME' && type === 'CONSUME') ||
        (filterType === 'RECEIVE' && type === 'RECEIVE') ||
        (filterType === 'WASTE' && type === 'WASTE') ||
        (filterType === 'ADJUST' && type.startsWith('ADJUSTMENT')) ||
        (filterType === 'TRANSFER' && type.startsWith('TRANSFER'));

      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        (m.batchNumber && m.batchNumber.toLowerCase().includes(searchLower)) ||
        (m.reason && m.reason.toLowerCase().includes(searchLower)) ||
        (m.referenceType && m.referenceType.toLowerCase().includes(searchLower)) ||
        (m.createdByName && m.createdByName.toLowerCase().includes(searchLower)) ||
        (m.storageLocationName && m.storageLocationName.toLowerCase().includes(searchLower));

      return matchesType && matchesSearch;
    });
  }, [movements, filterType, searchTerm]);

  // Aggregate statistics
  const totalConsumed = useMemo(() => {
    return movements
      .filter((m) => (m.movementType || '').toUpperCase() === 'CONSUME')
      .reduce((sum, m) => sum + (m.quantity || 0), 0);
  }, [movements]);

  const totalReceived = useMemo(() => {
    return movements
      .filter((m) => (m.movementType || '').toUpperCase() === 'RECEIVE')
      .reduce((sum, m) => sum + (m.quantity || 0), 0);
  }, [movements]);

  const totalWasted = useMemo(() => {
    return movements
      .filter((m) => (m.movementType || '').toUpperCase() === 'WASTE')
      .reduce((sum, m) => sum + (m.quantity || 0), 0);
  }, [movements]);

  const handleExportCSV = () => {
    if (movements.length === 0) return;
    const headers = [
      'Date & Time',
      'Batch Number',
      'Product',
      'Action',
      'Quantity',
      'Unit',
      'Storage Location',
      'Reference',
      'Reason',
      'Recorded By',
    ];

    const rows = filteredMovements.map((m) => [
      new Date(m.createdAt).toLocaleString(),
      `"${m.batchNumber || ''}"`,
      `"${m.ingredientName || ''}"`,
      m.movementType,
      m.quantity,
      m.unit,
      `"${m.storageLocationName || ''}"`,
      `"${m.referenceType || ''}"`,
      `"${(m.reason || '').replace(/"/g, '""')}"`,
      `"${m.createdByName || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `batch_history_${titleIngredient.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEventName = (type: string) => {
    const t = (type || '').toUpperCase();
    if (t === 'CONSUME') return 'Used in kitchen';
    if (t === 'RECEIVE') return 'Received';
    if (t === 'WASTE') return 'Wasted';
    if (t.startsWith('ADJUSTMENT')) return 'Stock adjustment';
    if (t.startsWith('TRANSFER')) return 'Transferred';
    return type;
  };

  const isDeduction = (type: string) => {
    const t = (type || '').toUpperCase();
    return t === 'CONSUME' || t === 'WASTE' || t === 'TRANSFER_OUT' || t === 'ADJUSTMENT_REMOVE';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-history-wide"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '840px', width: '95%' }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-title">
            <div className="modal-title-with-badge">
              <h3>Batch History</h3>
              {batch && <span className="pill-batch-code font-mono">Batch {batch.batchNumber}</span>}
            </div>
            <p>
              History for <strong>{titleIngredient}</strong> {titleSku ? `(${titleSku})` : ''}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="modal-body-scrollable">
          {/* Friendly Summary Cards */}
          <div className="history-kpis-grid">
            <div className="history-kpi-card">
              <div className="kpi-icon-wrap">
                <ArrowDownRight size={16} className="text-emerald" />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Total Used</span>
                <span className="kpi-val text-emerald">
                  {totalConsumed.toLocaleString(undefined, { maximumFractionDigits: 2 })} {titleUnit}
                </span>
              </div>
            </div>

            <div className="history-kpi-card">
              <div className="kpi-icon-wrap">
                <ArrowUpRight size={16} className="text-blue" />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Total Received</span>
                <span className="kpi-val text-blue">
                  {totalReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })} {titleUnit}
                </span>
              </div>
            </div>

            <div className="history-kpi-card">
              <div className="kpi-icon-wrap">
                <Package size={16} className="text-rose" />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">Total Waste</span>
                <span className="kpi-val text-rose">
                  {totalWasted.toLocaleString(undefined, { maximumFractionDigits: 2 })} {titleUnit}
                </span>
              </div>
            </div>

            <div className="history-kpi-card">
              <div className="kpi-icon-wrap">
                <Boxes size={16} className="text-secondary" />
              </div>
              <div className="kpi-body">
                <span className="kpi-label">
                  {batch ? 'Current Batch Stock' : 'Recorded Events'}
                </span>
                <span className="kpi-val">
                  {batch
                    ? `${batch.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${titleUnit}`
                    : movements.length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter & View Toolbar */}
          <div className="history-toolbar">
            <div className="history-filter-tabs">
              <button
                type="button"
                className={`history-tab-btn ${filterType === 'ALL' ? 'active' : ''}`}
                onClick={() => setFilterType('ALL')}
              >
                All ({movements.length})
              </button>
              <button
                type="button"
                className={`history-tab-btn ${filterType === 'CONSUME' ? 'active' : ''}`}
                onClick={() => setFilterType('CONSUME')}
              >
                Used
              </button>
              <button
                type="button"
                className={`history-tab-btn ${filterType === 'RECEIVE' ? 'active' : ''}`}
                onClick={() => setFilterType('RECEIVE')}
              >
                Received
              </button>
              <button
                type="button"
                className={`history-tab-btn ${filterType === 'WASTE' ? 'active' : ''}`}
                onClick={() => setFilterType('WASTE')}
              >
                Waste
              </button>
            </div>

            <div className="history-actions-bar">
              <div className="view-toggle-chips">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                  onClick={() => setViewMode('timeline')}
                  title="Timeline view"
                >
                  <GitCommit size={14} />
                  <span>Timeline</span>
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table view"
                >
                  <List size={14} />
                  <span>Table</span>
                </button>
              </div>

              <div className="search-box history-search">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="btn-icon"
                onClick={fetchHistory}
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
              </button>

              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={handleExportCSV}
                disabled={movements.length === 0}
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {error && <div className="alert-error mb-3">{error}</div>}

          {/* Timeline View */}
          {viewMode === 'timeline' && (
            <div className="traceability-timeline-container">
              {loading && movements.length === 0 ? (
                <div className="table-loading-box" style={{ minHeight: '160px' }}>
                  <RefreshCw size={20} className="spin text-accent mb-2" />
                  <span>Loading history...</span>
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="empty-box" style={{ padding: '2rem 1rem' }}>
                  <Clock size={32} className="text-muted mb-2" />
                  <h4>No events recorded</h4>
                  <p className="text-muted text-sm">No stock actions recorded for this item yet.</p>
                </div>
              ) : (
                <div className="vertical-timeline">
                  {filteredMovements.map((m) => {
                    const deduction = isDeduction(m.movementType);
                    const dateObj = new Date(m.createdAt);

                    return (
                      <div key={m.id} className="timeline-node">
                        <div className="timeline-marker">
                          <div className={`marker-dot ${deduction ? 'bg-rose' : 'bg-sage'}`} />
                        </div>

                        <div className="timeline-card">
                          <div className="timeline-card-header">
                            <div className="timeline-type-row">
                              <strong className="text-primary">{getEventName(m.movementType)}</strong>
                              {m.batchNumber && (
                                <span className="font-mono text-xs text-muted">
                                  Batch {m.batchNumber}
                                </span>
                              )}
                            </div>
                            <span className="timeline-timestamp">
                              {dateObj.toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              at{' '}
                              {dateObj.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <div className="timeline-card-body">
                            <div className="timeline-qty-highlight">
                              <span className={`qty-sign ${deduction ? 'text-rose' : 'text-emerald'}`}>
                                {deduction ? '-' : '+'}
                                {m.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {m.unit}
                              </span>
                              {m.storageLocationName && (
                                <span className="location-tag">
                                  <MapPin size={11} className="inline-icon text-muted" />
                                  {m.storageLocationName}
                                </span>
                              )}
                            </div>

                            {m.reason && (
                              <p className="timeline-reason text-secondary text-sm">
                                "{m.reason}"
                              </p>
                            )}
                          </div>

                          <div className="timeline-card-footer">
                            <span className="text-muted text-xs">
                              <UserIcon size={11} className="inline-icon" />
                              Recorded by {m.createdByName || 'Staff'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="table-card">
              <div className="table-responsive-wrapper">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Quantity</th>
                      {!batch && <th>Batch</th>}
                      <th>Location</th>
                      <th>Reason / Note</th>
                      <th>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.map((m) => {
                      const deduction = isDeduction(m.movementType);
                      const dateObj = new Date(m.createdAt);

                      return (
                        <tr key={m.id}>
                          <td className="text-nowrap text-sm">
                            {dateObj.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                          <td>
                            <strong>{getEventName(m.movementType)}</strong>
                          </td>
                          <td>
                            <span className={`font-mono font-bold ${deduction ? 'text-rose' : 'text-emerald'}`}>
                              {deduction ? '-' : '+'}
                              {m.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {m.unit}
                            </span>
                          </td>
                          {!batch && <td className="font-mono text-xs">{m.batchNumber || '—'}</td>}
                          <td>{m.storageLocationName || '—'}</td>
                          <td className="text-sm text-secondary">{m.reason || m.referenceType || '—'}</td>
                          <td className="text-sm">{m.createdByName || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
