import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ShoppingBag,
  PlusCircle,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  Truck,
  AlertTriangle,
  Search,
  RefreshCw,
  X,
  Clock,
  UserCheck,
  Building2,
  Plus,
  PackageCheck,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  PurchaseOrderResponse,
  PurchaseOrderItemResponse,
  IngredientResponse,
  SupplierResponse,
} from '../types';
import { useAuth } from '../context/useAuth';
import { ReceiveGoodsModal } from './ReceiveGoodsModal';

interface PurchaseOrdersViewProps {
  onSuccess?: (msg: string) => void;
}

interface FormOrderItemState {
  ingredientId: string;
  orderedQuantity: string;
  unitPrice: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return <span className="badge badge-default">Draft</span>;
    case 'PENDING_APPROVAL':
      return <span className="badge badge-amber">Pending Approval</span>;
    case 'APPROVED':
      return <span className="badge badge-emerald">Approved</span>;
    case 'ORDERED':
      return <span className="badge badge-blue">Ordered</span>;
    case 'PARTIALLY_RECEIVED':
      return <span className="badge badge-amber">Partially Received</span>;
    case 'RECEIVED':
      return <span className="badge badge-emerald">Received</span>;
    case 'COMPLETED':
      return <span className="badge badge-purple">Completed</span>;
    case 'REJECTED':
      return <span className="badge badge-rose">Rejected</span>;
    case 'CANCELLED':
      return <span className="badge badge-default">Cancelled</span>;
    default:
      return <span className="badge badge-default">{status}</span>;
  }
};

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({ onSuccess }) => {
  const { user } = useAuth();

  // Role permissions
  const canManageProcurement =
    user?.role === 'SYSTEM_ADMIN' || user?.role === 'PROCUREMENT_OFFICER';
  const isManager =
    user?.role === 'RESTAURANT_MANAGER' || user?.role === 'SYSTEM_ADMIN';
  const canCancel =
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'RESTAURANT_MANAGER' ||
    user?.role === 'PROCUREMENT_OFFICER';
  const canReceive =
    user?.role === 'SYSTEM_ADMIN' ||
    user?.role === 'RESTAURANT_MANAGER' ||
    user?.role === 'INVENTORY_MANAGER' ||
    user?.role === 'PROCUREMENT_OFFICER';

  // Data states
  const [orders, setOrders] = useState<PurchaseOrderResponse[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'
  >('ALL');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderResponse | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderResponse | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<PurchaseOrderResponse | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<PurchaseOrderResponse | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<PurchaseOrderResponse | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrderResponse | null>(null);

  const [formBusy, setFormBusy] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form input states
  const [formSupplierId, setFormSupplierId] = useState<string>('');
  const [formExpectedDate, setFormExpectedDate] = useState<string>('');
  const [formItems, setFormItems] = useState<FormOrderItemState[]>([
    { ingredientId: '', orderedQuantity: '1', unitPrice: '0.00' },
  ]);

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

  // Load purchase orders
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPurchaseOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load lookup data
  const loadLookups = useCallback(async () => {
    try {
      const [supps, ings] = await Promise.all([api.getSuppliers(), api.getIngredients()]);
      setSuppliers(supps.filter((s) => s.isActive));
      setIngredients(ings);
    } catch {
      // Lookups fail gracefully
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadLookups();
  }, [loadOrders, loadLookups]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) {
        return false;
      }

      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase();
      const matchesId = o.id.toLowerCase().includes(term);
      const matchesSupplier = o.supplierName?.toLowerCase().includes(term) ?? false;
      const matchesCreator = o.createdByName?.toLowerCase().includes(term) ?? false;
      const matchesIngredient = o.items?.some((i) =>
        i.ingredientName?.toLowerCase().includes(term)
      );

      return matchesId || matchesSupplier || matchesCreator || matchesIngredient;
    });
  }, [orders, statusFilter, searchTerm]);

  // Stats calculation
  const totalCount = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'PENDING_APPROVAL').length;
  const approvedCount = orders.filter((o) => o.status === 'APPROVED').length;
  const orderedCount = orders.filter((o) => o.status === 'ORDERED').length;
  const partiallyReceivedCount = orders.filter((o) => o.status === 'PARTIALLY_RECEIVED').length;
  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const draftCount = orders.filter((o) => o.status === 'DRAFT').length;

  // Calculate live total preview
  const liveTotalAmount = useMemo(() => {
    return formItems.reduce((sum, it) => {
      const qty = parseFloat(it.orderedQuantity) || 0;
      const price = parseFloat(it.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [formItems]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormSupplierId('');
    setFormExpectedDate('');
    setFormItems([{ ingredientId: '', orderedQuantity: '1', unitPrice: '0.00' }]);
    setModalError(null);
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (order: PurchaseOrderResponse) => {
    if (order.status !== 'DRAFT') return;
    setEditingOrder(order);
    setFormSupplierId(order.supplierId);
    setFormExpectedDate(
      order.expectedDeliveryDate ? order.expectedDeliveryDate.substring(0, 10) : ''
    );
    setFormItems(
      order.items.map((i) => ({
        ingredientId: i.ingredientId,
        orderedQuantity: i.orderedQuantity.toString(),
        unitPrice: i.unitPrice.toString(),
      }))
    );
    setModalError(null);
  };

  // Item row operations
  const handleAddItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      { ingredientId: '', orderedQuantity: '1', unitPrice: '0.00' },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof FormOrderItemState, value: string) => {
    setFormItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Form validation
  const validateForm = (): boolean => {
    if (!formSupplierId) {
      setModalError('Please select a supplier for this purchase order.');
      return false;
    }

    if (formItems.length === 0) {
      setModalError('At least one item is required in the purchase order.');
      return false;
    }

    const selectedIds: string[] = [];

    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item.ingredientId) {
        setModalError(`Please select an ingredient for item #${i + 1}.`);
        return false;
      }

      const qty = parseFloat(item.orderedQuantity);
      if (isNaN(qty) || qty <= 0) {
        setModalError(`Ordered quantity must be greater than 0 for item #${i + 1}.`);
        return false;
      }

      const price = parseFloat(item.unitPrice);
      if (isNaN(price) || price < 0) {
        setModalError(`Unit price must be non-negative for item #${i + 1}.`);
        return false;
      }

      if (selectedIds.includes(item.ingredientId)) {
        const ingName =
          ingredients.find((ing) => ing.id === item.ingredientId)?.name || 'Selected ingredient';
        setModalError(
          `Duplicate ingredient "${ingName}" detected. Each ingredient can appear only once per purchase order.`
        );
        return false;
      }
      selectedIds.push(item.ingredientId);
    }

    return true;
  };

  // Save Create PO
  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setFormBusy(true);
    setModalError(null);
    try {
      await api.createPurchaseOrder({
        supplierId: formSupplierId,
        expectedDeliveryDate: formExpectedDate ? new Date(formExpectedDate).toISOString() : null,
        items: formItems.map((i) => ({
          ingredientId: i.ingredientId,
          orderedQuantity: parseFloat(i.orderedQuantity),
          unitPrice: parseFloat(i.unitPrice),
        })),
      });

      setShowCreateModal(false);
      notify('Purchase order created successfully as Draft.');
      await loadOrders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Save Edit PO
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    if (!validateForm()) return;

    setFormBusy(true);
    setModalError(null);
    try {
      await api.updatePurchaseOrder(editingOrder.id, {
        supplierId: formSupplierId,
        expectedDeliveryDate: formExpectedDate ? new Date(formExpectedDate).toISOString() : null,
        items: formItems.map((i) => ({
          ingredientId: i.ingredientId,
          orderedQuantity: parseFloat(i.orderedQuantity),
          unitPrice: parseFloat(i.unitPrice),
        })),
      });

      setEditingOrder(null);
      notify('Purchase order updated successfully.');
      await loadOrders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Submit Draft PO for Approval
  const handleSubmitOrder = async (id: string) => {
    setFormBusy(true);
    try {
      await api.submitPurchaseOrder(id);
      notify('Purchase order submitted for managerial approval.');
      if (viewingOrder?.id === id) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Approve PO
  const handleApproveOrder = async (id: string) => {
    if (!isManager) return;
    setFormBusy(true);
    try {
      await api.approvePurchaseOrder(id);
      notify('Purchase order approved.');
      if (viewingOrder?.id === id) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Reject PO
  const handleConfirmReject = async () => {
    if (!rejectingOrder || !isManager) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.rejectPurchaseOrder(rejectingOrder.id);
      const reqId = rejectingOrder.id;
      setRejectingOrder(null);
      notify('Purchase order rejected.');
      if (viewingOrder?.id === reqId) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to reject purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Mark as Ordered
  const handleMarkAsOrdered = async (id: string) => {
    if (!canManageProcurement) return;
    setFormBusy(true);
    try {
      await api.markAsOrdered(id);
      notify('Purchase order marked as ORDERED with vendor.');
      if (viewingOrder?.id === id) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark purchase order as ordered.');
    } finally {
      setFormBusy(false);
    }
  };

  // Cancel PO
  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.cancelPurchaseOrder(cancellingOrder.id);
      const orderId = cancellingOrder.id;
      setCancellingOrder(null);
      notify('Purchase order cancelled.');
      if (viewingOrder?.id === orderId) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to cancel purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  // Delete Draft PO
  const handleConfirmDelete = async () => {
    if (!deletingOrder) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.deletePurchaseOrder(deletingOrder.id);
      const orderId = deletingOrder.id;
      setDeletingOrder(null);
      notify('Draft purchase order deleted successfully.');
      if (viewingOrder?.id === orderId) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete purchase order.');
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="view-container">
      {/* Header Banner */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Purchase Orders & Vendor Purchasing</h2>
          <p>
            Create, approve, and issue commercial purchase orders to active suppliers. Track delivery dates,
            item costs, and procurement order lifecycles.
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
            <ShoppingBag size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Orders</span>
            <span className="stat-value">{totalCount}</span>
            <span className="stat-subtext">All historical purchase orders</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-amber-glow">
            <Clock size={22} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pending Approval</span>
            <span className="stat-value text-amber">{pendingCount}</span>
            <span className="stat-subtext">Awaiting manager authorization</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <UserCheck size={22} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Approved Orders</span>
            <span className="stat-value text-emerald">{approvedCount}</span>
            <span className="stat-subtext">Authorized & ready to place</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <Truck size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Ordered / In Transit</span>
            <span className="stat-value text-blue">{orderedCount}</span>
            <span className="stat-subtext">Placed with suppliers</span>
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
              placeholder="Search by PO ID, supplier, requester, ingredient..."
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
            className={`btn-filter ${statusFilter === 'ORDERED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ORDERED')}
          >
            Ordered ({orderedCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'PARTIALLY_RECEIVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PARTIALLY_RECEIVED')}
          >
            Partially Received ({partiallyReceivedCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('COMPLETED')}
          >
            Completed ({completedCount})
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
            onClick={loadOrders}
            disabled={loading}
            title="Refresh Orders"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>

          {canManageProcurement && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenCreate}
            >
              <PlusCircle size={16} />
              <span>Create Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Purchase Orders Table */}
      <div className="table-card">
        {loading ? (
          <div className="table-loading">
            <RefreshCw size={32} className="spin text-accent" />
            <p className="text-muted text-sm">Loading purchase orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <ShoppingBag size={44} className="empty-icon" />
            <p className="font-bold">No purchase orders found</p>
            <p className="text-muted text-xs">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first purchase order to procure ingredients.'}
            </p>
            {canManageProcurement && !searchTerm && statusFilter === 'ALL' && (
              <button
                type="button"
                className="btn-primary mt-4"
                onClick={handleOpenCreate}
              >
                <PlusCircle size={16} />
                <span>Create First Purchase Order</span>
              </button>
            )}
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Supplier</th>
                <th>Order Date</th>
                <th>Expected Delivery</th>
                <th>Created By</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Items</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((po) => (
                <tr key={po.id}>
                  <td>
                    <span className="font-mono text-sm font-bold text-accent">
                      PO-{po.id.substring(0, 8).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="ingredient-title">{po.supplierName}</div>
                    <div className="text-xs text-muted location-pill">
                      <Building2 size={11} />
                      <span>Vendor</span>
                    </div>
                  </td>
                  <td>
                    {po.orderDate ? (
                      <span className="text-sm">
                        {new Date(po.orderDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    {po.expectedDeliveryDate ? (
                      <span className="text-sm">
                        {new Date(po.expectedDeliveryDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <span className="text-sm font-medium">{po.createdByName || 'Staff'}</span>
                  </td>
                  <td>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                      ${po.totalAmount.toFixed(2)}
                    </span>
                  </td>
                  <td>{getStatusBadge(po.status)}</td>
                  <td>
                    <span className="badge badge-default">
                      {po.items.length} {po.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="action-buttons-row">
                      {/* View Details */}
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setViewingOrder(po)}
                        title="View Details"
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>

                      {/* Edit (Draft only, procurement users) */}
                      {po.status === 'DRAFT' && canManageProcurement && (
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => handleOpenEdit(po)}
                          title="Edit Draft"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                      )}

                      {/* Submit (Draft only, procurement users) */}
                      {po.status === 'DRAFT' && canManageProcurement && (
                        <button
                          type="button"
                          className="btn-table-action btn-batch-receive"
                          onClick={() => handleSubmitOrder(po.id)}
                          title="Submit For Approval"
                          disabled={formBusy}
                        >
                          <Send size={13} />
                          <span>Submit</span>
                        </button>
                      )}

                      {/* Approve / Reject (Pending Approval, Manager/Admin only) */}
                      {po.status === 'PENDING_APPROVAL' && isManager && (
                        <>
                          <button
                            type="button"
                            className="btn-table-action btn-batch-receive"
                            onClick={() => handleApproveOrder(po.id)}
                            title="Approve Order"
                            disabled={formBusy}
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </button>

                          <button
                            type="button"
                            className="btn-table-action btn-batch-waste"
                            onClick={() => {
                              setRejectingOrder(po);
                              setModalError(null);
                            }}
                            title="Reject Order"
                            disabled={formBusy}
                          >
                            <XCircle size={13} />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {/* Mark as Ordered (Approved only, procurement users) */}
                      {po.status === 'APPROVED' && canManageProcurement && (
                        <button
                          type="button"
                          className="btn-table-action btn-batch-transfer"
                          onClick={() => handleMarkAsOrdered(po.id)}
                          title="Mark As Ordered With Supplier"
                          disabled={formBusy}
                        >
                          <Truck size={13} />
                          <span>Order</span>
                        </button>
                      )}

                      {/* Receive Goods (ORDERED and PARTIALLY_RECEIVED only) */}
                      {(po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && canReceive && (
                        <button
                          type="button"
                          className="btn-table-action btn-batch-receive"
                          onClick={() => setReceivingOrder(po)}
                          title="Receive Goods"
                          disabled={formBusy}
                        >
                          <PackageCheck size={13} />
                          <span>Receive</span>
                        </button>
                      )}

                      {/* Cancel (Non-terminal states: Draft, Pending, Approved, Ordered) */}
                      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED'].includes(po.status) &&
                        canCancel && (
                          <button
                            type="button"
                            className="btn-table-action"
                            style={{ color: 'var(--amber)' }}
                            onClick={() => {
                              setCancellingOrder(po);
                              setModalError(null);
                            }}
                            title="Cancel Order"
                            disabled={formBusy}
                          >
                            <Ban size={13} />
                            <span>Cancel</span>
                          </button>
                        )}

                      {/* Delete (Draft only, procurement users) */}
                      {po.status === 'DRAFT' && canManageProcurement && (
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ color: 'var(--rose)' }}
                          onClick={() => {
                            setDeletingOrder(po);
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

      {/* CREATE PURCHASE ORDER MODAL */}
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
                <ShoppingBag size={24} className="text-blue" />
              </div>
              <div>
                <h3>Create Purchase Order</h3>
                <p>Prepare a commercial purchase order for active restaurant suppliers.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCreate} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Supplier Vendor <span className="text-rose">*</span>
                  </label>
                  <select
                    required
                    value={formSupplierId}
                    onChange={(e) => setFormSupplierId(e.target.value)}
                    disabled={formBusy}
                  >
                    <option value="">-- Select Active Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.paymentTerms ? `(${s.paymentTerms})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Expected Delivery Date (Optional)</label>
                  <input
                    type="date"
                    value={formExpectedDate}
                    onChange={(e) => setFormExpectedDate(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              {/* Items Line Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    Purchase Order Items <span className="text-rose">*</span>
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
                  {formItems.map((item, idx) => {
                    const rowQty = parseFloat(item.orderedQuantity) || 0;
                    const rowPrice = parseFloat(item.unitPrice) || 0;
                    const rowTotal = rowQty * rowPrice;

                    return (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="text-xs font-mono text-muted">
                              Subtotal: <strong className="text-white">${rowTotal.toFixed(2)}</strong>
                            </span>
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
                        </div>

                        <div className="form-row">
                          <div className="form-group" style={{ gridColumn: 'span 2' }}>
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
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label className="text-xs">
                              Ordered Quantity <span className="text-rose">*</span>
                            </label>
                            <input
                              type="number"
                              required
                              min="0.001"
                              step="any"
                              placeholder="e.g., 50"
                              value={item.orderedQuantity}
                              onChange={(e) =>
                                handleItemChange(idx, 'orderedQuantity', e.target.value)
                              }
                              disabled={formBusy}
                            />
                          </div>

                          <div className="form-group">
                            <label className="text-xs">
                              Unit Price ($) <span className="text-rose">*</span>
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              placeholder="e.g., 4.50"
                              value={item.unitPrice}
                              onChange={(e) =>
                                handleItemChange(idx, 'unitPrice', e.target.value)
                              }
                              disabled={formBusy}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Total Preview Card */}
              <div
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="text-xs text-muted block">ESTIMATED TOTAL AMOUNT</span>
                  <span className="text-xs text-muted">(Authoritatively recalculated on server)</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  ${liveTotalAmount.toFixed(2)}
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
                    <span>Create Draft Order</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DRAFT PURCHASE ORDER MODAL */}
      {editingOrder && (
        <div className="modal-overlay" onClick={() => !formBusy && setEditingOrder(null)}>
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setEditingOrder(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-purple-glow">
                <Pencil size={24} className="text-accent" />
              </div>
              <div>
                <h3>Edit Purchase Order</h3>
                <p>
                  Modify line items, quantities, or prices for draft PO-
                  {editingOrder.id.substring(0, 8).toUpperCase()}.
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
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Supplier Vendor <span className="text-rose">*</span>
                  </label>
                  <select
                    required
                    value={formSupplierId}
                    onChange={(e) => setFormSupplierId(e.target.value)}
                    disabled={formBusy}
                  >
                    <option value="">-- Select Active Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.paymentTerms ? `(${s.paymentTerms})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Expected Delivery Date (Optional)</label>
                  <input
                    type="date"
                    value={formExpectedDate}
                    onChange={(e) => setFormExpectedDate(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              {/* Items Line Builder */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    Purchase Order Items <span className="text-rose">*</span>
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
                  {formItems.map((item, idx) => {
                    const rowQty = parseFloat(item.orderedQuantity) || 0;
                    const rowPrice = parseFloat(item.unitPrice) || 0;
                    const rowTotal = rowQty * rowPrice;

                    return (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="text-xs font-mono text-muted">
                              Subtotal: <strong className="text-white">${rowTotal.toFixed(2)}</strong>
                            </span>
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
                        </div>

                        <div className="form-row">
                          <div className="form-group" style={{ gridColumn: 'span 2' }}>
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
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label className="text-xs">
                              Ordered Quantity <span className="text-rose">*</span>
                            </label>
                            <input
                              type="number"
                              required
                              min="0.001"
                              step="any"
                              value={item.orderedQuantity}
                              onChange={(e) =>
                                handleItemChange(idx, 'orderedQuantity', e.target.value)
                              }
                              disabled={formBusy}
                            />
                          </div>

                          <div className="form-group">
                            <label className="text-xs">
                              Unit Price ($) <span className="text-rose">*</span>
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) =>
                                handleItemChange(idx, 'unitPrice', e.target.value)
                              }
                              disabled={formBusy}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Total Preview Card */}
              <div
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="text-xs text-muted block">ESTIMATED TOTAL AMOUNT</span>
                  <span className="text-xs text-muted">(Authoritatively recalculated on server)</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  ${liveTotalAmount.toFixed(2)}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingOrder(null)}
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
      {viewingOrder && (
        <div className="modal-overlay" onClick={() => setViewingOrder(null)}>
          <div
            className="modal-content modal-large"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setViewingOrder(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <ShoppingBag size={24} className="text-blue" />
              </div>
              <div>
                <h3>Purchase Order Details</h3>
                <p className="font-mono">PO-{viewingOrder.id.toUpperCase()}</p>
              </div>
            </div>

            {/* Overview Summary Cards */}
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
                <div>{getStatusBadge(viewingOrder.status)}</div>
              </div>

              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Supplier</span>
                <strong className="text-sm">{viewingOrder.supplierName}</strong>
              </div>

              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Total Amount</span>
                <strong className="text-sm" style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>
                  ${viewingOrder.totalAmount.toFixed(2)}
                </strong>
              </div>

              <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                <span className="text-xs text-muted">Created By</span>
                <span className="text-sm">{viewingOrder.createdByName || 'Staff'}</span>
                <span className="text-xs text-muted">
                  {new Date(viewingOrder.createdAt).toLocaleDateString()}
                </span>
              </div>

              {viewingOrder.approvedByName && (
                <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                  <span className="text-xs text-muted">Approved By</span>
                  <strong className="text-sm">{viewingOrder.approvedByName}</strong>
                </div>
              )}

              {viewingOrder.orderDate && (
                <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                  <span className="text-xs text-muted">Order Date</span>
                  <span className="text-sm">
                    {new Date(viewingOrder.orderDate).toLocaleDateString()}
                  </span>
                </div>
              )}

              {viewingOrder.expectedDeliveryDate && (
                <div className="batch-context-summary" style={{ flexDirection: 'column', gap: '0.2rem', margin: 0 }}>
                  <span className="text-xs text-muted">Expected Delivery</span>
                  <span className="text-sm">
                    {new Date(viewingOrder.expectedDeliveryDate).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <h4 className="text-sm font-bold mb-2">
              Ordered Items ({viewingOrder.items.length})
            </h4>
            <div className="table-card mb-4">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ingredient</th>
                    <th>Unit</th>
                    <th>Ordered Qty</th>
                    <th>Unit Price</th>
                    <th>Line Subtotal</th>
                    <th>Received Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingOrder.items.map((it: PurchaseOrderItemResponse, idx: number) => {
                    const subtotal = it.orderedQuantity * it.unitPrice;
                    return (
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
                            {it.orderedQuantity}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">${it.unitPrice.toFixed(2)}</span>
                        </td>
                        <td>
                          <strong className="text-sm text-white">${subtotal.toFixed(2)}</strong>
                        </td>
                        <td>
                          <span className="text-sm text-muted">
                            {it.receivedQuantity}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions inside detail modal */}
            <div className="modal-actions">
              {viewingOrder.status === 'DRAFT' && canManageProcurement && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const ord = viewingOrder;
                      setViewingOrder(null);
                      handleOpenEdit(ord);
                    }}
                  >
                    <Pencil size={14} />
                    <span>Edit Draft</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleSubmitOrder(viewingOrder.id)}
                    disabled={formBusy}
                  >
                    <Send size={14} />
                    <span>Submit For Approval</span>
                  </button>
                </>
              )}

              {viewingOrder.status === 'PENDING_APPROVAL' && isManager && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ borderColor: 'rgba(244, 63, 94, 0.4)', color: 'var(--rose)' }}
                    onClick={() => {
                      const ord = viewingOrder;
                      setRejectingOrder(ord);
                    }}
                  >
                    <XCircle size={14} />
                    <span>Reject</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleApproveOrder(viewingOrder.id)}
                    disabled={formBusy}
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve Order</span>
                  </button>
                </>
              )}

              {viewingOrder.status === 'APPROVED' && canManageProcurement && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleMarkAsOrdered(viewingOrder.id)}
                  disabled={formBusy}
                >
                  <Truck size={14} />
                  <span>Mark as Ordered</span>
                </button>
              )}

              {(viewingOrder.status === 'ORDERED' || viewingOrder.status === 'PARTIALLY_RECEIVED') && canReceive && (
                <button
                  type="button"
                  className="btn-primary btn-batch-receive"
                  onClick={() => {
                    const ord = viewingOrder;
                    setViewingOrder(null);
                    setReceivingOrder(ord);
                  }}
                  disabled={formBusy}
                >
                  <PackageCheck size={14} />
                  <span>Receive Goods</span>
                </button>
              )}

              {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED'].includes(viewingOrder.status) &&
                canCancel && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ color: 'var(--amber)', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                    onClick={() => {
                      const ord = viewingOrder;
                      setCancellingOrder(ord);
                    }}
                  >
                    <Ban size={14} />
                    <span>Cancel Order</span>
                  </button>
                )}

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewingOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingOrder && (
        <div className="modal-overlay" onClick={() => !formBusy && setRejectingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setRejectingOrder(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <XCircle size={24} className="text-rose" />
              </div>
              <div>
                <h3>Reject Purchase Order</h3>
                <p>
                  Reject authorization for PO-
                  {rejectingOrder.id.substring(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to reject this purchase order from supplier{' '}
              <strong>&quot;{rejectingOrder.supplierName}&quot;</strong>? This will transition its
              status to REJECTED and prevent it from being placed.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejectingOrder(null)}
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
      {cancellingOrder && (
        <div className="modal-overlay" onClick={() => !formBusy && setCancellingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setCancellingOrder(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-amber-glow">
                <Ban size={24} className="text-amber" />
              </div>
              <div>
                <h3>Cancel Purchase Order</h3>
                <p>Are you sure you want to cancel this purchase order?</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Cancelling order{' '}
              <strong>PO-{cancellingOrder.id.substring(0, 8).toUpperCase()}</strong> will transition it
              to CANCELLED status. It will no longer be eligible for ordering or delivery fulfillment.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancellingOrder(null)}
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
                  <span>Cancel Order</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE DRAFT MODAL */}
      {deletingOrder && (
        <div className="modal-overlay" onClick={() => !formBusy && setDeletingOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setDeletingOrder(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <Trash2 size={24} className="text-rose" />
              </div>
              <div>
                <h3>Delete Draft Order</h3>
                <p>Permanently remove this unsubmitted draft order.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to permanently delete draft order{' '}
              <strong>PO-{deletingOrder.id.substring(0, 8).toUpperCase()}</strong>?
              This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingOrder(null)}
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

      {/* RECEIVE GOODS MODAL */}
      {receivingOrder && (
        <ReceiveGoodsModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onSuccess={(msg) => {
            notify(msg);
            loadOrders();
          }}
        />
      )}
    </div>
  );
};
