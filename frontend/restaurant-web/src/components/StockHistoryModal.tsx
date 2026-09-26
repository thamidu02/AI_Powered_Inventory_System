import React, { useEffect, useState, useMemo } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Clock,
  Download,
  History,
  MapPin,
  Package,
  RefreshCw,
  Search,
  User as UserIcon,
  X,
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

  const targetIngredientId = ingredientId || batch?.ingredientId;
  const targetBatchId = batch?.id;
  const titleIngredient =
    ingredientName || batch?.ingredientName || (movements.length > 0 ? movements[0].ingredientName : 'Ingredient');
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
      setError(err instanceof Error ? err.message : 'Failed to load stock movements history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [targetBatchId, targetIngredientId]);

  // Filtered movements based on filterType and searchTerm
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

  // Export to CSV
  const handleExportCSV = () => {
    if (movements.length === 0) return;
    const headers = [
      'Date & Time',
      'Batch Number',
      'Ingredient',
      'Movement Type',
      'Quantity',
      'Unit',
      'Storage Location',
      'Reference Type',
      'Reason',
      'Recorded By',
      'User Email',
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
      `"${m.createdByEmail || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filename = batch
      ? `consume_history_batch_${batch.batchNumber}.csv`
      : `consume_history_${titleIngredient.replace(/\s+/g, '_')}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMovementBadge = (type: string) => {
    const t = (type || '').toUpperCase();
    if (t === 'CONSUME') {
      return <span className="badge badge-purple">CONSUMED</span>;
    }
    if (t === 'RECEIVE') {
      return <span className="badge badge-emerald">RECEIVED</span>;
    }
    if (t === 'WASTE') {
      return <span className="badge badge-rose">WASTE</span>;
    }
    if (t.startsWith('ADJUSTMENT')) {
      return <span className="badge badge-amber">{t.replace('ADJUSTMENT_', 'ADJ ')}</span>;
    }
    if (t.startsWith('TRANSFER')) {
      return <span className="badge badge-blue">{t.replace('TRANSFER_', 'XFER ')}</span>;
    }
    return <span className="badge badge-default">{type}</span>;
  };

  const isDeduction = (type: string) => {
    const t = (type || '').toUpperCase();
    return t === 'CONSUME' || t === 'WASTE' || t === 'TRANSFER_OUT' || t === 'ADJUSTMENT_REMOVE';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-history-wide"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '960px', width: '95%' }}
      >
        <button type="button" className="modal-close" onClick={onClose} title="Close">
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div className="modal-icon-badge bg-purple-glow">
            <History size={24} className="text-purple" />
          </div>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {batch ? 'Batch Consume & Movement History' : 'Ingredient Consume History'}
              {batch && <span className="pill-batch-code font-mono">{batch.batchNumber}</span>}
            </h3>
            <p>
              {batch ? (
                <>
                  Detailed consumption & movement audit log for <strong>{titleIngredient}</strong>
                  {titleSku ? ` (${titleSku})` : ''} in batch <strong>{batch.batchNumber}</strong>
                </>
              ) : (
                <>
                  Full consumption & movement history for <strong>{titleIngredient}</strong>
                  {titleSku ? ` (${titleSku})` : ''} across all batches
                </>
              )}
            </p>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="history-kpis-grid">
          <div className="history-kpi-card kpi-purple">
            <div className="kpi-icon-wrap">
              <ArrowDownRight size={18} className="text-purple" />
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Total Consumed</span>
              <span className="kpi-val text-purple">
                {totalConsumed.toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                <span className="kpi-unit">{titleUnit}</span>
              </span>
            </div>
          </div>

          <div className="history-kpi-card kpi-emerald">
            <div className="kpi-icon-wrap">
              <ArrowUpRight size={18} className="text-emerald" />
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Total Received</span>
              <span className="kpi-val text-emerald">
                {totalReceived.toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                <span className="kpi-unit">{titleUnit}</span>
              </span>
            </div>
          </div>

          <div className="history-kpi-card kpi-rose">
            <div className="kpi-icon-wrap">
              <Package size={18} className="text-rose" />
            </div>
            <div className="kpi-body">
              <span className="kpi-label">Total Waste</span>
              <span className="kpi-val text-rose">
                {totalWasted.toLocaleString(undefined, { maximumFractionDigits: 3 })}{' '}
                <span className="kpi-unit">{titleUnit}</span>
              </span>
            </div>
          </div>

          <div className="history-kpi-card kpi-blue">
            <div className="kpi-icon-wrap">
              <Boxes size={18} className="text-blue" />
            </div>
            <div className="kpi-body">
              <span className="kpi-label">
                {batch ? 'Current Batch Stock' : 'Total Movement Records'}
              </span>
              <span className="kpi-val text-blue">
                {batch
                  ? `${batch.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${titleUnit}`
                  : movements.length}
              </span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="history-toolbar">
          <div className="history-filter-tabs">
            <button
              type="button"
              className={`history-tab-btn ${filterType === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterType('ALL')}
            >
              All Events ({movements.length})
            </button>
            <button
              type="button"
              className={`history-tab-btn ${filterType === 'CONSUME' ? 'active' : ''}`}
              onClick={() => setFilterType('CONSUME')}
            >
              Consumed Only (
              {movements.filter((m) => (m.movementType || '').toUpperCase() === 'CONSUME').length}
              )
            </button>
            <button
              type="button"
              className={`history-tab-btn ${filterType === 'RECEIVE' ? 'active' : ''}`}
              onClick={() => setFilterType('RECEIVE')}
            >
              Received (
              {movements.filter((m) => (m.movementType || '').toUpperCase() === 'RECEIVE').length}
              )
            </button>
            <button
              type="button"
              className={`history-tab-btn ${filterType === 'WASTE' ? 'active' : ''}`}
              onClick={() => setFilterType('WASTE')}
            >
              Waste (
              {movements.filter((m) => (m.movementType || '').toUpperCase() === 'WASTE').length}
              )
            </button>
          </div>

          <div className="history-actions-bar">
            <div className="input-with-icon search-input history-search">
              <Search size={16} className="input-icon" />
              <input
                type="text"
                placeholder="Filter by reason, ref, user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn-icon"
              onClick={fetchHistory}
              title="Refresh Movement History"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>

            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleExportCSV}
              disabled={movements.length === 0}
              title="Export history to CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {error && <div className="alert-error mb-3">{error}</div>}

        {/* History Table */}
        <div className="history-table-container">
          {loading && movements.length === 0 ? (
            <div className="table-loading" style={{ minHeight: '220px' }}>
              <RefreshCw size={24} className="spin text-purple" />
              <span>Fetching live consume and movement history...</span>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 1rem' }}>
              <Clock size={40} className="empty-icon text-muted" />
              <h4>No Movement Records Found</h4>
              <p className="text-muted text-sm">
                {searchTerm || filterType !== 'ALL'
                  ? 'No events match the selected filters.'
                  : 'No stock movements have been recorded for this item yet.'}
              </p>
            </div>
          ) : (
            <table className="custom-table history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Quantity</th>
                  {!batch && <th>Batch</th>}
                  <th>Location</th>
                  <th>Reason / Reference</th>
                  <th>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => {
                  const deduction = isDeduction(m.movementType);
                  const dateObj = new Date(m.createdAt);
                  return (
                    <tr key={m.id}>
                      <td className="text-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-muted" />
                          <span className="text-sm font-medium">
                            {dateObj.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-muted" style={{ paddingLeft: '1rem' }}>
                          {dateObj.toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>

                      <td>{getMovementBadge(m.movementType)}</td>

                      <td className="text-nowrap">
                        <span
                          className={`font-mono font-bold ${
                            deduction ? 'text-rose' : 'text-emerald'
                          }`}
                        >
                          {deduction ? '-' : '+'}
                          {m.quantity.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}{' '}
                          <span className="text-xs text-muted">{m.unit}</span>
                        </span>
                      </td>

                      {!batch && (
                        <td>
                          <span className="font-mono text-xs text-accent">
                            {m.batchNumber || '—'}
                          </span>
                        </td>
                      )}

                      <td>
                        <span className="location-pill text-xs">
                          <MapPin size={11} className="inline-icon text-muted" />
                          {m.storageLocationName || '—'}
                        </span>
                      </td>

                      <td>
                        <div className="text-sm">
                          {m.reason || (
                            <span className="text-muted italic">No reason specified</span>
                          )}
                        </div>
                        {m.referenceType && (
                          <div className="text-xs text-muted">
                            Ref: <span className="font-mono">{m.referenceType}</span>
                            {m.referenceId ? ` (${m.referenceId.substring(0, 8)}...)` : ''}
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="flex items-center gap-1 text-sm">
                          <UserIcon size={12} className="text-muted" />
                          <span>{m.createdByName || 'System User'}</span>
                        </div>
                        {m.createdByEmail && (
                          <div className="text-xs text-muted" style={{ paddingLeft: '1rem' }}>
                            {m.createdByEmail}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
          <div className="text-muted text-xs flex items-center gap-1">
            <History size={12} />
            <span>
              Showing {filteredMovements.length} of {movements.length} total events
            </span>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
