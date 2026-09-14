import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  PlusCircle,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Users,
  ClipboardList,
} from 'lucide-react';
import { api } from '../services/api';
import type { SupplierResponse } from '../types';
import { useAuth } from '../context/useAuth';
import { PurchaseRequestsView } from './PurchaseRequestsView';

interface ProcurementDashboardProps {
  onSuccess?: (msg: string) => void;
}

export const ProcurementDashboard: React.FC<ProcurementDashboardProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'requests' | 'suppliers'>('requests');

  // Data states
  const [suppliers, setSuppliers] = useState<SupplierResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal states
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierResponse | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierResponse | null>(null);
  const [formBusy, setFormBusy] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form input states
  const [formName, setFormName] = useState<string>('');
  const [formContactPerson, setFormContactPerson] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formPaymentTerms, setFormPaymentTerms] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // RBAC permissions
  const canManage = user?.role === 'SYSTEM_ADMIN' || user?.role === 'PROCUREMENT_OFFICER';

  const notify = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
    if (onSuccess) {
      onSuccess(msg);
    }
  };

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    api.getSuppliers()
      .then((data) => {
        if (!ignore) {
          setSuppliers(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load supplier records.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && !s.isActive) return false;
      if (statusFilter === 'INACTIVE' && s.isActive) return false;

      // Search term
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchesName = s.name.toLowerCase().includes(term);
      const matchesContact = s.contactPerson?.toLowerCase().includes(term) ?? false;
      const matchesEmail = s.email?.toLowerCase().includes(term) ?? false;
      const matchesPhone = s.phone?.toLowerCase().includes(term) ?? false;
      const matchesTerms = s.paymentTerms?.toLowerCase().includes(term) ?? false;

      return matchesName || matchesContact || matchesEmail || matchesPhone || matchesTerms;
    });
  }, [suppliers, statusFilter, searchTerm]);

  // Stats calculation
  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((s) => s.isActive).length;
  const inactiveCount = suppliers.filter((s) => !s.isActive).length;

  // Open Create Modal
  const handleOpenAdd = () => {
    setFormName('');
    setFormContactPerson('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormPaymentTerms('');
    setFormIsActive(true);
    setModalError(null);
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (supplier: SupplierResponse) => {
    setEditingSupplier(supplier);
    setFormName(supplier.name);
    setFormContactPerson(supplier.contactPerson || '');
    setFormEmail(supplier.email || '');
    setFormPhone(supplier.phone || '');
    setFormAddress(supplier.address || '');
    setFormPaymentTerms(supplier.paymentTerms || '');
    setFormIsActive(supplier.isActive);
    setModalError(null);
  };

  // Submit Create Supplier
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError('Supplier name is required.');
      return;
    }

    setFormBusy(true);
    setModalError(null);
    try {
      await api.createSupplier({
        name: formName.trim(),
        contactPerson: formContactPerson.trim() || null,
        email: formEmail.trim() || null,
        phone: formPhone.trim() || null,
        address: formAddress.trim() || null,
        paymentTerms: formPaymentTerms.trim() || null,
      });

      setShowAddModal(false);
      notify(`Supplier '${formName.trim()}' created successfully.`);
      await loadSuppliers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create supplier.');
    } finally {
      setFormBusy(false);
    }
  };

  // Submit Edit Supplier
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    if (!formName.trim()) {
      setModalError('Supplier name is required.');
      return;
    }

    setFormBusy(true);
    setModalError(null);
    try {
      await api.updateSupplier(editingSupplier.id, {
        name: formName.trim(),
        contactPerson: formContactPerson.trim() || null,
        email: formEmail.trim() || null,
        phone: formPhone.trim() || null,
        address: formAddress.trim() || null,
        paymentTerms: formPaymentTerms.trim() || null,
        isActive: formIsActive,
      });

      setEditingSupplier(null);
      notify(`Supplier '${formName.trim()}' updated successfully.`);
      await loadSuppliers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update supplier.');
    } finally {
      setFormBusy(false);
    }
  };

  // Toggle Active/Inactive status
  const handleToggleStatus = async (supplier: SupplierResponse) => {
    if (!canManage) return;
    const updatedStatus = !supplier.isActive;
    const actionLabel = updatedStatus ? 'activate' : 'deactivate';

    try {
      await api.updateSupplier(supplier.id, {
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
        paymentTerms: supplier.paymentTerms,
        isActive: updatedStatus,
      });

      notify(`Supplier '${supplier.name}' ${actionLabel}d successfully.`);
      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${actionLabel} supplier.`);
    }
  };

  // Submit Delete Supplier
  const handleConfirmDelete = async () => {
    if (!deletingSupplier) return;
    setFormBusy(true);
    setModalError(null);
    try {
      await api.deleteSupplier(deletingSupplier.id);
      const deletedName = deletingSupplier.name;
      setDeletingSupplier(null);
      notify(`Supplier '${deletedName}' deleted successfully.`);
      await loadSuppliers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete supplier.');
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="view-container">
      {/* Subtabs: Purchase Requests vs Suppliers */}
      <div className="catalog-header">
        <div className="catalog-tabs">
          <button
            type="button"
            className={`catalog-tab ${subTab === 'requests' ? 'active' : ''}`}
            onClick={() => setSubTab('requests')}
          >
            <ClipboardList size={16} />
            <span>Purchase Requests</span>
          </button>
          <button
            type="button"
            className={`catalog-tab ${subTab === 'suppliers' ? 'active' : ''}`}
            onClick={() => setSubTab('suppliers')}
          >
            <Building2 size={16} />
            <span>Suppliers ({suppliers.length})</span>
          </button>
        </div>
      </div>

      {subTab === 'requests' ? (
        <PurchaseRequestsView onSuccess={onSuccess} />
      ) : (
        <>
          {/* Header Banner */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Procurement & Supplier Management</h2>
          <p>
            Manage restaurant vendor relationships, contact profiles, address directories, and payment terms.
            Vendors managed here provide ingredient supply catalogs for procurement orders.
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
            <Building2 size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Suppliers</span>
            <span className="stat-value">{totalCount}</span>
            <span className="stat-subtext">Registered vendors</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <Users size={22} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Active Suppliers</span>
            <span className="stat-value text-emerald">{activeCount}</span>
            <span className="stat-subtext">Available for purchasing</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-amber-glow">
            <PowerOff size={22} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Inactive Suppliers</span>
            <span className="stat-value text-muted">{inactiveCount}</span>
            <span className="stat-subtext">Deactivated vendors</span>
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
              placeholder="Search by supplier name, contact, email, phone..."
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
            className={`btn-filter ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'INACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('INACTIVE')}
          >
            Inactive ({inactiveCount})
          </button>
        </div>

        <div className="quick-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={loadSuppliers}
            disabled={loading}
            title="Refresh Suppliers"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>

          {canManage && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenAdd}
            >
              <PlusCircle size={16} />
              <span>Add Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="table-card">
        {loading ? (
          <div className="table-loading">
            <RefreshCw size={32} className="spin text-accent" />
            <p className="text-muted text-sm">Loading supplier directory...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="empty-state">
            <Building2 size={44} className="empty-icon" />
            <p className="font-bold">No suppliers found</p>
            <p className="text-muted text-xs">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or filter tags.'
                : 'Get started by adding your first supplier vendor.'}
            </p>
            {canManage && !searchTerm && statusFilter === 'ALL' && (
              <button
                type="button"
                className="btn-primary mt-4"
                onClick={handleOpenAdd}
              >
                <PlusCircle size={16} />
                <span>Add First Supplier</span>
              </button>
            )}
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>Contact Person</th>
                <th>Contact Details</th>
                <th>Address</th>
                <th>Payment Terms</th>
                <th>Status</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="ingredient-title">{s.name}</div>
                    <div className="text-xs text-muted font-mono">ID: {s.id.substring(0, 8)}...</div>
                  </td>
                  <td>
                    {s.contactPerson ? (
                      <span className="text-sm">{s.contactPerson}</span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <div className="dashboard-list" style={{ gap: '0.2rem' }}>
                      {s.phone && (
                        <span className="text-xs location-pill">
                          <Phone size={12} className="text-muted" />
                          <span>{s.phone}</span>
                        </span>
                      )}
                      {s.email && (
                        <span className="text-xs location-pill">
                          <Mail size={12} className="text-muted" />
                          <span>{s.email}</span>
                        </span>
                      )}
                      {!s.phone && !s.email && <span className="text-muted text-xs">—</span>}
                    </div>
                  </td>
                  <td>
                    {s.address ? (
                      <span className="text-xs location-pill" title={s.address}>
                        <MapPin size={12} className="text-muted" />
                        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.address}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    {s.paymentTerms ? (
                      <span className="badge badge-default">
                        <CreditCard size={11} className="inline-icon" />
                        {s.paymentTerms}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    {s.isActive ? (
                      <span className="badge badge-emerald">Active</span>
                    ) : (
                      <span className="badge badge-rose">Inactive</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <div className="action-buttons-row">
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => handleOpenEdit(s)}
                          title="Edit Supplier"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          className={`btn-table-action ${s.isActive ? 'btn-batch-adjust' : 'btn-batch-receive'}`}
                          onClick={() => handleToggleStatus(s)}
                          title={s.isActive ? 'Deactivate Supplier' : 'Activate Supplier'}
                        >
                          {s.isActive ? (
                            <>
                              <PowerOff size={13} />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <Power size={13} />
                              <span>Activate</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="btn-icon"
                          style={{ color: 'var(--rose)' }}
                          onClick={() => {
                            setDeletingSupplier(s);
                            setModalError(null);
                          }}
                          title="Delete Supplier"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE SUPPLIER MODAL */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => !formBusy && setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setShowAddModal(false)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-blue-glow">
                <Building2 size={24} className="text-blue" />
              </div>
              <div>
                <h3>Add New Supplier</h3>
                <p>Register a new vendor for restaurant procurement and purchasing.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="modal-form">
              <div className="form-group">
                <label>
                  Supplier Name <span className="text-rose">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Highland Fresh Dairies"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g., John Perera"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g., +94 77 123 4567"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g., sales@highlandfresh.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <input
                    type="text"
                    placeholder="e.g., Net 30, COD, 14 Days"
                    value={formPaymentTerms}
                    onChange={(e) => setFormPaymentTerms(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Physical Address</label>
                <textarea
                  rows={2}
                  placeholder="e.g., No. 45 Dairy Farm Road, Ambewela"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formBusy || !formName.trim()}
                >
                  {formBusy ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Supplier</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SUPPLIER MODAL */}
      {editingSupplier && (
        <div className="modal-overlay" onClick={() => !formBusy && setEditingSupplier(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setEditingSupplier(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-purple-glow">
                <Pencil size={24} className="text-accent" />
              </div>
              <div>
                <h3>Edit Supplier Profile</h3>
                <p>Modify contact information, terms, or active vendor status.</p>
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
                <label>
                  Supplier Name <span className="text-rose">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    disabled={formBusy}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Terms</label>
                  <input
                    type="text"
                    value={formPaymentTerms}
                    onChange={(e) => setFormPaymentTerms(e.target.value)}
                    disabled={formBusy}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Physical Address</label>
                <textarea
                  rows={2}
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  disabled={formBusy}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    disabled={formBusy}
                    style={{ width: 'auto' }}
                  />
                  <span>Supplier is Active (available for new purchase orders)</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingSupplier(null)}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formBusy || !formName.trim()}
                >
                  {formBusy ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Updating...</span>
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

      {/* DELETE CONFIRMATION MODAL */}
      {deletingSupplier && (
        <div className="modal-overlay" onClick={() => !formBusy && setDeletingSupplier(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => !formBusy && setDeletingSupplier(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-header">
              <div className="modal-icon-badge bg-rose-glow">
                <Trash2 size={24} className="text-rose" />
              </div>
              <div>
                <h3>Delete Supplier</h3>
                <p>Verify deletion of vendor records from the system.</p>
              </div>
            </div>

            {modalError && (
              <div className="alert-error mb-4">
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Are you sure you want to permanently delete supplier{' '}
              <strong style={{ color: 'var(--text-main)' }}>&quot;{deletingSupplier.name}&quot;</strong>?
              <br />
              <span className="text-xs text-muted block mt-1">
                Note: Suppliers referenced by existing purchase orders or purchase request history cannot be deleted and should be deactivated instead.
              </span>
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingSupplier(null)}
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
                  <span>Delete Supplier</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
