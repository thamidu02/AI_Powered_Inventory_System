import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  PlusCircle,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  Search,
  RefreshCw,
  X,
  Clock,
  UserCheck,
  Building2,
  Plus,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  PurchaseRequestResponse,
  PurchaseRequestItemResponse,
  IngredientResponse,
  SupplierResponse,
} from '../types';
import { useAuth } from '../context/useAuth';

interface PurchaseRequestsViewProps {
  onSuccess?: (msg: string) => void;
}

interface FormItemState {
  ingredientId: string;
  requestedQuantity: string;
  suggestedSupplierId: string;
  notes: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return <span className="badge badge-default">Draft</span>;
    case 'PENDING_APPROVAL':
      return <span className="badge badge-amber">Pending Approval</span>;
    case 'APPROVED':
      return <span className="badge badge-emerald">Approved</span>;
    case 'REJECTED':
      return <span className="badge badge-rose">Rejected</span>;
    case 'CANCELLED':
      return <span className="badge badge-default">Cancelled</span>;
    default:
      return <span className="badge badge-default">{status}</span>;
  }
};

export const PurchaseRequestsView: React.FC<PurchaseRequestsViewProps> = ({ onSuccess }) => {
  const { user } = useAuth();

  // Permissions
  const isManager = user?.role === 'RESTAURANT_MANAGER' || user?.role === 'SYSTEM_ADMIN';

  // Data states
  const [requests, setRequests] = useState<PurchaseRequestResponse[]>([]);
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Search & Status filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  >('ALL');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingRequest, setEditingRequest] = useState<PurchaseRequestResponse | null>(null);
  const [viewingRequest, setViewingRequest] = useState<PurchaseRequestResponse | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<PurchaseRequestResponse | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<PurchaseRequestResponse | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<PurchaseRequestResponse | null>(null);

  const [formBusy, setFormBusy] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form states
  const [formReason, setFormReason] = useState<string>('');
  const [formItems, setFormItems] = useState<FormItemState[]>([
    { ingredientId: '', requestedQuantity: '1', suggestedSupplierId: '', notes: '' },
  ]);
  const [rejectReason, setRejectReason] = useState<string>('');

  const notify = useCallback(
    (msg: string) => {
      setNotice(msg);
      setTimeout(() => setNotice(null), 4000);
      if (onSuccess) {
        onSuccess(msg);
      }
    },
    [onSuccess]
  );

  // Load purchase requests
  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPurchaseRequests();
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load ingredients & suppliers for dropdowns
  const loadLookups = useCallback(async () => {
    try {
      const [ings, supps] = await Promise.all([api.getIngredients(), api.getSuppliers()]);
      setIngredients(ings);
      setSuppliers(supps.filter((s) => s.isActive));
    } catch {
      // Lookup error handled silently, form dropdowns will fallback to empty
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadLookups();
  }, [loadRequests, loadLookups]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }

      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase();
      const matchesId = r.id.toLowerCase().includes(term);
      const matchesRequester = r.requestedByName?.toLowerCase().includes(term) ?? false;
      const matchesReason = r.reason?.toLowerCase().includes(term) ?? false;
      const matchesIngredient = r.items?.some((i) =>
        i.ingredientName?.toLowerCase().includes(term)
      );

      return matchesId || matchesRequester || matchesReason || matchesIngredient;
    });
  }, [requests, statusFilter, searchTerm]);

  // Stats calculation
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
  const draftCount = requests.filter((r) => r.status === 'DRAFT').length;

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormReason('');
    setFormItems([
      { ingredientId: '', requestedQuantity: '1', suggestedSupplierId: '', notes: '' },
    ]);
    setModalError(null);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (request: PurchaseRequestResponse) => {
    if (request.status !== 'DRAFT') return;
    setEditingRequest(request);
    setFormReason(request.reason || '');
    setFormItems(
      request.items.map((i) => ({
        ingredientId: i.ingredientId,
        requestedQuantity: i.requestedQuantity.toString(),
        suggestedSupplierId: i.suggestedSupplierId || '',
        notes: i.notes || '',
      }))
    );
    setModalError(null);
  };

  // Add Item row in form
  const handleAddItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      { ingredientId: '', requestedQuantity: '1', suggestedSupplierId: '', notes: '' },
    ]);
  };

  // Remove Item row in form
  const handleRemoveItemRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Update Item row field
  const handleItemChange = (index: number, field: keyof FormItemState, value: string) => {
    setFormItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Validate form items client-side
  const validateForm = (): boolean => {
    if (formItems.length === 0) {
      setModalError('At least one ingredient item is required.');
      return false;
    }

    const selectedIds: string[] = [];

    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item.ingredientId) {
        setModalError(`Please select an ingredient for item #${i + 1}.`);
        return false;
      }

      const qty = parseFloat(item.requestedQuantity);
      if (isNaN(qty) || qty <= 0) {
        setModalError(`Requested quantity must be greater than 0 for item #${i + 1}.`);
        return false;
      }

      if (selectedIds.includes(item.ingredientId)) {
        const ingName =
          ingredients.find((ing) => ing.id === item.ingredientId)?.name || 'Selected ingredient';
        setModalError(
          `Duplicate ingredient "${ingName}" detected. Each ingredient can only be added once per request.`
        );
        return false;
      }
      selectedIds.push(item.ingredientId);
    }

    return true;
  };

  // Save Create Request
  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setFormBusy(true);
    setModalError(null);
    try {
      await api.createPurchaseRequest({
        reason: formReason.trim() || null,
        items: formItems.map((i) => ({
          ingredientId: i.ingredientId,
          requestedQuantity: parseFloat(i.requestedQuantity),
          suggestedSupplierId: i.suggestedSupplierId || null,
          notes: i.notes.trim() || null,
        })),
      });

      setShowCreateModal(false);
      notify('Purchase request created successfully as Draft.');
      await loadRequests();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Save Edit Request
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    if (!validateForm()) return;

    setFormBusy(true);
    setModalError(null);
    try {
      await api.updatePurchaseRequest(editingRequest.id, {
        reason: formReason.trim() || null,
        items: formItems.map((i) => ({
          ingredientId: i.ingredientId,
          requestedQuantity: parseFloat(i.requestedQuantity),
          suggestedSupplierId: i.suggestedSupplierId || null,
          notes: i.notes.trim() || null,
        })),
      });

      setEditingRequest(null);
      notify('Purchase request updated successfully.');
      await loadRequests();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Submit Draft Request for Approval
  const handleSubmitRequest = async (id: string) => {
    setFormBusy(true);
    try {
      await api.submitPurchaseRequest(id);
      notify('Purchase request submitted for managerial approval.');
      if (viewingRequest?.id === id) {
        setViewingRequest(null);
      }
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Approve Request
  const handleApproveRequest = async (id: string) => {
    if (!isManager) return;
    setFormBusy(true);
    try {
      await api.approvePurchaseRequest(id);
      notify('Purchase request approved successfully.');
      if (viewingRequest?.id === id) {
        setViewingRequest(null);
      }
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Reject Request
  const handleConfirmReject = async () => {
    if (!rejectingRequest || !isManager) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.rejectPurchaseRequest(rejectingRequest.id, {
        reason: rejectReason.trim() || undefined,
      });
      const reqId = rejectingRequest.id;
      setRejectingRequest(null);
      setRejectReason('');
      notify('Purchase request rejected.');
      if (viewingRequest?.id === reqId) {
        setViewingRequest(null);
      }
      await loadRequests();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to reject purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Cancel Request
  const handleConfirmCancel = async () => {
    if (!cancellingRequest) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.cancelPurchaseRequest(cancellingRequest.id);
      const reqId = cancellingRequest.id;
      setCancellingRequest(null);
      notify('Purchase request cancelled.');
      if (viewingRequest?.id === reqId) {
        setViewingRequest(null);
      }
      await loadRequests();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to cancel purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  // Delete Draft Request
  const handleConfirmDelete = async () => {
    if (!deletingRequest) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.deletePurchaseRequest(deletingRequest.id);
      const reqId = deletingRequest.id;
      setDeletingRequest(null);
      notify('Draft purchase request deleted successfully.');
      if (viewingRequest?.id === reqId) {
        setViewingRequest(null);
      }
      await loadRequests();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete purchase request.');
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="view-container">
      {/* Header Banner */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Purchase Requests & Requisitions</h2>
          <p>
            Create, submit, review and track ingredient purchasing requisitions. Requisitions undergo
            managerial approval before purchase orders are issued to suppliers.
          </p>
        </div>
        <div className="hub-role-status">
          <span className="text-muted text-xs">LOGGED IN AS</span>
          <strong>{user?.fullName}</strong>
          <span className="role-pill-accent">{user?.role?.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="info-banner">
          <CheckCircle2 size={18} className="text-emerald" />
          <span>{notice}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <ClipboardList size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Requests</span>
            <span className="stat-value">{totalCount}</span>
            <span className="stat-subtext">All historical requisitions</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-amber-glow">
            <Clock size={22} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Approval</span>
            <span className="stat-value text-amber">{pendingCount}</span>
            <span className="stat-subtext">Awaiting manager review</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <UserCheck size={22} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Approved Requests</span>
            <span className="stat-value text-emerald">{approvedCount}</span>
            <span className="stat-subtext">Ready for ordering</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-purple-glow">
            <Pencil size={22} className="text-accent" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Draft Requests</span>
            <span className="stat-value text-muted">{draftCount}</span>
            <span className="stat-subtext">In preparation</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search, Filter, Actions */}
      <div className="controls-bar">
        <div className="search-group">
          <div className="input-with-icon search-input">
            <Search size={16} className="input-icon" />
            <input
              type="text"
              placeholder="Search by ID, requester, ingredient, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`btn-filter ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'DRAFT' ? 'active' : ''}`}
            onClick={() => setStatusFilter('DRAFT')}
          >
            Draft ({draftCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'PENDING_APPROVAL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PENDING_APPROVAL')}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'APPROVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('APPROVED')}
          >
            Approved ({approvedCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'REJECTED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('REJECTED')}
          >
            Rejected
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'CANCELLED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('CANCELLED')}
          >
            Cancelled
          </button>
        </div>

        <div className="quick-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={loadRequests}
            disabled={loading}
            title="Refresh Requests"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenCreate}
          >
            <PlusCircle size={16} />
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Requests Table */}
      <div className="table-card">
        {loading ? (
          <div className="table-loading">
            <RefreshCw size={32} className="spin text-accent" />
            <p className="text-muted text-sm">Loading purchase requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={44} className="empty-icon" />
            <p className="font-bold">No purchase requests found</p>
            <p className="text-muted text-xs">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first purchase request to order ingredients.'}
            </p>
            {!searchTerm && statusFilter === 'ALL' && (
              <button
                type="button"
                className="btn-primary mt-4"
                onClick={handleOpenCreate}
              >
                <PlusCircle size={16} />
                <span>Create Purchase Request</span>
              </button>
            )}
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Requested Date</th>
                <th>Requested By</th>
                <th>Status</th>
                <th>Items</th>
                <th>Reason / Notes</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="font-mono text-sm font-bold text-accent">
                      PR-{r.id.substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm">
                      {new Date(r.requestedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div className="text-xs text-muted">
                      {new Date(r.requestedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td>
                    <span className="text-sm font-bold">{r.requestedByName || 'Staff'}</span>
                  </td>
                  <td>{getStatusBadge(r.status)}</td>
                  <td>
                    <span className="badge badge-default">
                      {r.items.length} {r.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </td>
                  <td>
                    {r.reason ? (
                      <span
                        className="text-xs text-muted"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          maxWidth: '220px',
                        }}
                        title={r.reason}
                      >
                        {r.reason}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="action-buttons-row">
                      {/* View Details */}
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setViewingRequest(r)}
                        title="View Request Details"
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>

                      {/* Edit (Draft only) */}
                      {r.status === 'DRAFT' && (
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => handleOpenEdit(r)}
                          title="Edit Draft"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                      )}

                      {/* Submit (Draft only) */}
                      {r.status === 'DRAFT' && (
                        <button
                          type="button"
                          className="btn-table-action btn-batch-receive"
                          onClick={() => handleSubmitRequest(r.id)}
                          title="Submit For Approval"
                          disabled={formBusy}
                        >
                          <Send size={13} />
                          <span>Submit</span>
                        </button>
                      )}

                      {/* Approve / Reject (Pending Approval, Manager/Admin only) */}
                      {r.status === 'PENDING_APPROVAL' && isManager && (
                        <>
                          <button
                            type="button"
                            className="btn-table-action btn-batch-receive"
                            onClick={() => handleApproveRequest(r.id)}
                            title="Approve Request"
                            disabled={formBusy}
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </button>

                          <button
                            type="button"
                            className="btn-table-action btn-batch-waste"
                            onClick={() => {
                              setRejectingRequest(r);
                              setRejectReason('');
                              setModalError(null);
                            }}
                            title="Reject Request"
                            disabled={formBusy}
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {/* Cancel (Draft or Pending Approval) */}
                      {(r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL') && (
                        <button
                          type="button"
                          className="btn-table-action"
                          style={{ color: 'var(--amber)' }}
                          onClick={() => {
                            setCancellingRequest(r);
                            setModalError(null);
                          }}
                          title="Cancel Request"
                          disabled={formBusy}
                        >
                          <Ban size={13} />
                          <span>Cancel</span>
                        </button>
                      )}

                      {/* Delete (Draft only) */}
                      {r.status === 'DRAFT' && (
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ color: 'var(--rose)' }}
                          onClick={() => {
                            setDeletingRequest(r);
                            setModalError(null);
                          }}
                          title="Delete Draft"
                          disabled={formBusy}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE REQUEST MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => !formBusy && setShowCreateModal(false)}>
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setShowCreateModal(false)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <ClipboardList size={24} className="text-blue" />
              </div>
              <div>
                <h3>Create Purchase Request</h3>
                <p>Add required ingredients and quantities for purchasing approval.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCreate} className="modal-form">
              <div className="form-group">
                <label>Reason / Purpose of Request</label>
                <textarea
                  rows={2}
                  placeholder="e.g., Weekly stock replenishment, weekend banquet preparation..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              {/* Items Line Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    Requested Ingredients <span className="text-rose">*</span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    style={{ padding: '0.25rem 0.6rem' }}
                    onClick={handleAddItemRow}
                    disabled={formBusy}
                  >
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-xs font-bold text-accent">Item #{idx + 1}</span>
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ color: 'var(--rose)', padding: '0.2rem' }}
                            onClick={() => handleRemoveItemRow(idx)}
                            disabled={formBusy}
                            title="Remove Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="text-xs">
                            Ingredient <span className="text-rose">*</span>
                          </label>
                          <select
                            required
                            value={item.ingredientId}
                            onChange={(e) => handleItemChange(idx, 'ingredientId', e.target.value)}
                            disabled={formBusy}
                          >
                            <option value="">-- Select Ingredient --</option>
                            {ingredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit}) — SKU: {ing.sku}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="text-xs">
                            Requested Quantity <span className="text-rose">*</span>
                          </label>
                          <input
                            type="number"
                            required
                            min="0.001"
                            step="any"
                            placeholder="e.g., 25"
                            value={item.requestedQuantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'requestedQuantity', e.target.value)
                            }
                            disabled={formBusy}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="text-xs">Suggested Supplier (Optional)</label>
                          <select
                            value={item.suggestedSupplierId}
                            onChange={(e) =>
                              handleItemChange(idx, 'suggestedSupplierId', e.target.value)
                            }
                            disabled={formBusy}
                          >
                            <option value="">-- No Suggested Supplier --</option>
                            {suppliers.map((supp) => (
                              <option key={supp.id} value={supp.id}>
                                {supp.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="text-xs">Item Notes (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g., Premium grade, organic if available"
                            value={item.notes}
                            onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                            disabled={formBusy}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formBusy}
                >
                  {formBusy ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Saving Draft...</span>
                    </>
                  ) : (
                    <span>Create Draft Request</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT REQUEST MODAL */}
      {editingRequest && (
        <div className="modal-overlay" onClick={() => !formBusy && setEditingRequest(null)}>
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setEditingRequest(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-purple-glow">
                <Pencil size={24} className="text-accent" />
              </div>
              <div>
                <h3>Edit Purchase Request</h3>
                <p>
                  Modify line items or reason for draft PR-
                  {editingRequest.id.substring(0, 8).toUpperCase()}.
                </p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="modal-form">
              <div className="form-group">
                <label>Reason / Purpose of Request</label>
                <textarea
                  rows={2}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              {/* Items Line Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    Requested Ingredients <span className="text-rose">*</span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    style={{ padding: '0.25rem 0.6rem' }}
                    onClick={handleAddItemRow}
                    disabled={formBusy}
                  >
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-xs font-bold text-accent">Item #{idx + 1}</span>
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon"
                            style={{ color: 'var(--rose)', padding: '0.2rem' }}
                            onClick={() => handleRemoveItemRow(idx)}
                            disabled={formBusy}
                            title="Remove Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="text-xs">
                            Ingredient <span className="text-rose">*</span>
                          </label>
                          <select
                            required
                            value={item.ingredientId}
                            onChange={(e) => handleItemChange(idx, 'ingredientId', e.target.value)}
                            disabled={formBusy}
                          >
                            <option value="">-- Select Ingredient --</option>
                            {ingredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit}) — SKU: {ing.sku}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="text-xs">
                            Requested Quantity <span className="text-rose">*</span>
                          </label>
                          <input
                            type="number"
                            required
                            min="0.001"
                            step="any"
                            value={item.requestedQuantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'requestedQuantity', e.target.value)
                            }
                            disabled={formBusy}
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="text-xs">Suggested Supplier (Optional)</label>
                          <select
                            value={item.suggestedSupplierId}
                            onChange={(e) =>
                              handleItemChange(idx, 'suggestedSupplierId', e.target.value)
                            }
                            disabled={formBusy}
                          >
                            <option value="">-- No Suggested Supplier --</option>
                            {suppliers.map((supp) => (
                              <option key={supp.id} value={supp.id}>
                                {supp.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="text-xs">Item Notes (Optional)</label>
                          <input
                            type="text"
                            value={item.notes}
                            onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                            disabled={formBusy}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingRequest(null)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formBusy}
                >
                  {formBusy ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL VIEW MODAL */}
      {viewingRequest && (
        <div className="modal-overlay" onClick={() => setViewingRequest(null)}>
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setViewingRequest(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <ClipboardList size={24} className="text-blue" />
              </div>
              <div>
                <h3>Purchase Request Details</h3>
                <p className="font-mono">PR-{viewingRequest.id.toUpperCase()}</p>
              </div>
            </div>

            {/* Request Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Status</span>
                <div>{getStatusBadge(viewingRequest.status)}</div>
              </div>

              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Requested By</span>
                <strong className="text-sm">{viewingRequest.requestedByName || 'Staff'}</strong>
              </div>

              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Requested Date</span>
                <span className="text-sm">
                  {new Date(viewingRequest.requestedAt).toLocaleString()}
                </span>
              </div>

              {viewingRequest.approvedByName && (
                <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                  <span className="text-xs text-muted">Reviewed By</span>
                  <strong className="text-sm">{viewingRequest.approvedByName}</strong>
                  {viewingRequest.approvedAt && (
                    <span className="text-xs text-muted">
                      {new Date(viewingRequest.approvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Reason */}
            {viewingRequest.reason && (
              <div className="info-banner mb-4" style={{ flexDirection: 'column', gap: '0.25rem' }}>
                <strong className="text-xs text-muted">Reason / Notes:</strong>
                <p className="text-sm" style={{ margin: 0, color: 'var(--text-main)' }}>
                  {viewingRequest.reason}
                </p>
              </div>
            )}

            {/* Items Table */}
            <h4 className="text-sm font-bold mb-2">
              Requested Items ({viewingRequest.items.length})
            </h4>
            <div className="table-card mb-4">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ingredient</th>
                    <th>Unit</th>
                    <th>Quantity</th>
                    <th>Suggested Supplier</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingRequest.items.map((it: PurchaseRequestItemResponse, idx: number) => (
                    <tr key={it.id}>
                      <td className="text-muted text-xs">{idx + 1}</td>
                      <td>
                        <strong className="text-sm">{it.ingredientName}</strong>
                      </td>
                      <td>
                        <span className="badge badge-default">{it.ingredientUnit}</span>
                      </td>
                      <td>
                        <span className="text-sm font-bold text-accent">
                          {it.requestedQuantity}
                        </span>
                      </td>
                      <td>
                        {it.suggestedSupplierName ? (
                          <span className="text-xs location-pill">
                            <Building2 size={12} className="text-muted" />
                            <span>{it.suggestedSupplierName}</span>
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <span className="text-xs text-muted">{it.notes || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons inside detail modal */}
            <div className="modal-actions">
              {viewingRequest.status === 'DRAFT' && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const req = viewingRequest;
                      setViewingRequest(null);
                      handleOpenEdit(req);
                    }}
                  >
                    <Pencil size={14} />
                    <span>Edit Draft</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleSubmitRequest(viewingRequest.id)}
                    disabled={formBusy}
                  >
                    <Send size={14} />
                    <span>Submit For Approval</span>
                  </button>
                </>
              )}

              {viewingRequest.status === 'PENDING_APPROVAL' && isManager && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ borderColor: 'rgba(244, 63, 94, 0.4)', color: 'var(--rose)' }}
                    onClick={() => {
                      const req = viewingRequest;
                      setRejectingRequest(req);
                      setRejectReason('');
                    }}
                  >
                    <XCircle size={14} />
                    <span>Reject</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleApproveRequest(viewingRequest.id)}
                    disabled={formBusy}
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve Request</span>
                  </button>
                </>
              )}

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewingRequest(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingRequest && (
        <div className="modal-overlay" onClick={() => !formBusy && setRejectingRequest(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setRejectingRequest(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <XCircle size={24} className="text-rose" />
              </div>
              <div>
                <h3>Reject Purchase Request</h3>
                <p>
                  Rejection prevents ordering. PR-
                  {rejectingRequest.id.substring(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <div className="form-group">
              <label>Rejection Reason (Optional)</label>
              <textarea
                rows={3}
                placeholder="e.g., Sufficient inventory in stock, budget constraints, duplicate request..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={formBusy}
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejectingRequest(null)}
                disabled={formBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmReject}
                disabled={formBusy}
              >
                {formBusy ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <span>Confirm Rejection</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancellingRequest && (
        <div className="modal-overlay" onClick={() => !formBusy && setCancellingRequest(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setCancellingRequest(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-amber-glow">
                <Ban size={24} className="text-amber" />
              </div>
              <div>
                <h3>Cancel Purchase Request</h3>
                <p>Are you sure you want to cancel this purchase request?</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Cancelling request{' '}
              <strong>PR-{cancellingRequest.id.substring(0, 8).toUpperCase()}</strong> will move it
              to CANCELLED status. It will no longer be eligible for approval or purchasing.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancellingRequest(null)}
                disabled={formBusy}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-danger"
                style={{ background: 'var(--amber)', color: '#000' }}
                onClick={handleConfirmCancel}
                disabled={formBusy}
              >
                {formBusy ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Cancel Request</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE DRAFT MODAL */}
      {deletingRequest && (
        <div className="modal-overlay" onClick={() => !formBusy && setDeletingRequest(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setDeletingRequest(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <Trash2 size={24} className="text-rose" />
              </div>
              <div>
                <h3>Delete Draft Request</h3>
                <p>Permanently remove this unsubmitted draft.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to permanently delete draft request{' '}
              <strong>PR-{deletingRequest.id.substring(0, 8).toUpperCase()}</strong>?
              This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingRequest(null)}
                disabled={formBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={formBusy}
              >
                {formBusy ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Draft</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
