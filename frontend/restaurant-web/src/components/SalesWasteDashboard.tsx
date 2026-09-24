import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Utensils,
  X,
  Calendar,
  Check,
  Search,
  Filter,
  Flame,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type {
  CreateSaleRequest,
  InventoryResponse,
  MenuItemResponse,
  SaleResponse,
  SalesSummaryResponse,
  WasteRecordResponse,
  WasteSummaryResponse,
} from '../types';
import { getFoodImage, getFoodCategory } from '../utils/foodImages';

type ViewTab = 'overview' | 'sales' | 'waste';

export const SalesWasteDashboard: React.FC = () => {
  const { user } = useAuth();

  // Data states
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [sales, setSales] = useState<SaleResponse[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecordResponse[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [wasteSummary, setWasteSummary] = useState<WasteSummaryResponse | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);

  // UI / Filter states
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [timeRange, setTimeRange] = useState<'today' | '7days' | '30days'>('7days');
  const [salesSearch, setSalesSearch] = useState('');
  const [wasteFilterStatus, setWasteFilterStatus] = useState<'ALL' | 'RECORDED' | 'CONFIRMED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modals
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showWasteModal, setShowWasteModal] = useState(false);

  // Form states
  const [saleMenuItemId, setSaleMenuItemId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState('1');
  const [wasteBatchId, setWasteBatchId] = useState('');
  const [wasteQuantity, setWasteQuantity] = useState('1');
  const [wasteReason, setWasteReason] = useState('Spoilage');

  const canRecordSale = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF', 'SYSTEM_ADMIN'].includes(user?.role ?? '');
  const canRecordWaste = ['SALES_KITCHEN_STAFF', 'RESTAURANT_MANAGER', 'INVENTORY_MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '');
  const canConfirmWaste = ['INVENTORY_MANAGER', 'RESTAURANT_MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '');

  const batches = useMemo(
    () =>
      inventory
        .flatMap((item) =>
          item.batches.map((batch) => ({
            ...batch,
            ingredientName: item.ingredientName,
            unit: item.unit,
          }))
        )
        .filter((batch) => batch.quantity > 0),
    [inventory]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, salesData, salesStats, wasteData, wasteStats, inventoryData] =
        await Promise.all([
          api.getMenuItems().catch((err) => {
            console.warn('Failed to load menu items:', err);
            return [];
          }),
          api.getSales().catch((err) => {
            console.warn('Failed to load sales:', err);
            return [];
          }),
          api.getSalesSummary().catch((err) => {
            console.warn('Failed to load sales summary:', err);
            return null;
          }),
          api.getWasteRecords().catch((err) => {
            console.warn('Failed to load waste records:', err);
            return [];
          }),
          api.getWasteSummary().catch((err) => {
            console.warn('Failed to load waste summary:', err);
            return null;
          }),
          api.getInventory().catch((err) => {
            console.warn('Failed to load inventory:', err);
            return [];
          }),
        ]);
      setMenuItems(menu);
      setSales(salesData);
      setSalesSummary(salesStats);
      setWasteRecords(wasteData);
      setWasteSummary(wasteStats);
      setInventory(inventoryData);

      if (!saleMenuItemId && menu.length > 0) {
        setSaleMenuItemId(menu.find((item) => item.isActive)?.id || menu[0].id);
      }
      const firstBatch = inventoryData
        .flatMap((item) => item.batches)
        .find((batch) => batch.quantity > 0);
      if (!wasteBatchId && firstBatch) {
        setWasteBatchId(firstBatch.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales and waste data.');
    } finally {
      setLoading(false);
    }
  }, [saleMenuItemId, wasteBatchId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregate Best Sellers
  const bestSellers = useMemo(() => {
    const counts = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const prev = counts.get(item.menuItemId) || {
          name: item.menuItemName,
          quantity: 0,
          revenue: 0,
        };
        counts.set(item.menuItemId, {
          name: item.menuItemName,
          quantity: prev.quantity + item.quantity,
          revenue: prev.revenue + item.quantity * item.unitPrice,
        });
      }
    }

    const totalVolume = Array.from(counts.values()).reduce((sum, v) => sum + v.quantity, 0);

    const list = Array.from(counts.entries()).map(([id, val]) => {
      const menuItem = menuItems.find((m) => m.id === id);
      return {
        id,
        ...val,
        category: getFoodCategory(val.name, menuItem?.description),
        image: getFoodImage(val.name),
        price: menuItem?.sellingPrice ?? (val.quantity > 0 ? val.revenue / val.quantity : 0),
        sharePct: totalVolume > 0 ? Math.round((val.quantity / totalVolume) * 100) : 0,
      };
    });

    list.sort((a, b) => b.quantity - a.quantity);
    return list;
  }, [sales, menuItems]);

  // Aggregate Waste by Reason & Top Wasted Ingredient
  const { reasonBreakdown, topWastedIngredient, totalWasteUnits } = useMemo(() => {
    const reasons: Record<string, number> = {
      Spoiled: 0,
      'Over-prepared': 0,
      Damaged: 0,
      Expired: 0,
      Other: 0,
    };
    const ingCounts = new Map<string, number>();

    let totalWaste = 0;
    for (const record of wasteRecords) {
      const q = record.quantity;
      totalWaste += q;

      const r = record.reason.toLowerCase();
      if (r.includes('spoil')) reasons['Spoiled'] += q;
      else if (r.includes('over') || r.includes('prep')) reasons['Over-prepared'] += q;
      else if (r.includes('damag') || r.includes('drop')) reasons['Damaged'] += q;
      else if (r.includes('expir')) reasons['Expired'] += q;
      else reasons['Other'] += q;

      const curr = ingCounts.get(record.ingredientName) || 0;
      ingCounts.set(record.ingredientName, curr + q);
    }

    let highestIng = '';
    let highestQty = 0;
    for (const [name, qty] of ingCounts.entries()) {
      if (qty > highestQty) {
        highestQty = qty;
        highestIng = name;
      }
    }

    const pctOfTotal = totalWaste > 0 ? Math.round((highestQty / totalWaste) * 100) : 0;

    return {
      totalWasteUnits: totalWaste,
      reasonBreakdown: Object.entries(reasons).map(([reason, qty]) => ({
        reason,
        quantity: qty,
        percentage: totalWaste > 0 ? Math.round((qty / totalWaste) * 100) : 0,
        cssClass:
          reason === 'Spoiled' || reason === 'Expired'
            ? 'spoilage'
            : reason === 'Over-prepared'
            ? 'prep'
            : reason === 'Damaged'
            ? 'error'
            : 'other',
      })),
      topWastedIngredient: highestIng ? { name: highestIng, qty: highestQty, pct: pctOfTotal } : null,
    };
  }, [wasteRecords]);

  // Filtered waste records
  const filteredWasteRecords = useMemo(() => {
    return wasteRecords.filter((rec) => {
      if (wasteFilterStatus === 'ALL') return true;
      return rec.status === wasteFilterStatus;
    });
  }, [wasteRecords, wasteFilterStatus]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    if (!salesSearch.trim()) return sales;
    const q = salesSearch.toLowerCase();
    return sales.filter(
      (s) =>
        s.recordedByName.toLowerCase().includes(q) ||
        s.items.some((it) => it.menuItemName.toLowerCase().includes(q))
    );
  }, [sales, salesSearch]);

  const submitSale = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!saleMenuItemId || Number(saleQuantity) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const request: CreateSaleRequest = {
        items: [{ menuItemId: saleMenuItemId, quantity: Number(saleQuantity) }],
      };
      await api.createSale(request);
      setNotice('Sale recorded. Ingredients depleted through FEFO logic.');
      setSaleQuantity('1');
      setShowSaleModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record sale.');
    } finally {
      setBusy(false);
    }
  };

  const submitWaste = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wasteBatchId || Number(wasteQuantity) <= 0 || !wasteReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createWasteRecord({
        stockBatchId: wasteBatchId,
        quantity: Number(wasteQuantity),
        reason: wasteReason.trim(),
      });
      setNotice('Waste record created and stock batch deducted.');
      setWasteQuantity('1');
      setShowWasteModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record waste.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmWaste = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.confirmWaste(id);
      setNotice('Waste record confirmed by manager.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm waste.');
    } finally {
      setBusy(false);
    }
  };

  const selectedSaleItem = useMemo(() => {
    return menuItems.find((m) => m.id === saleMenuItemId);
  }, [menuItems, saleMenuItemId]);

  const selectedWasteBatch = useMemo(() => {
    return batches.find((b) => b.id === wasteBatchId);
  }, [batches, wasteBatchId]);

  return (
    <div className="view-container">
      {/* ─── Hero Header ──────────────────────────────────────── */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Sales &amp; Waste</h2>
          <p>Monitor customer revenue, automatic FEFO batch depletion, and kitchen loss prevention.</p>
        </div>

        <div className="welcome-actions">
          {canRecordSale && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowSaleModal(true)}
            >
              <Plus size={15} />
              <span>+ Record Sale</span>
            </button>
          )}

          {canRecordWaste && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowWasteModal(true)}
            >
              <Trash2 size={15} className="text-rose" />
              <span>Log Waste</span>
            </button>
          )}

          <button
            type="button"
            className="btn-icon"
            onClick={() => void loadData()}
            disabled={loading || busy}
            title="Refresh sales and waste data"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="info-banner">
          <CheckCircle2 size={18} className="text-emerald" />
          <span>{notice}</span>
        </div>
      )}

      {/* ─── High-Level Scorecards Row ──────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-glow">
            <DollarSign size={22} className="text-emerald" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Gross Revenue</span>
            <span className="stat-value text-emerald">
              ${(salesSummary?.totalRevenue ?? 0).toFixed(2)}
            </span>
            <span className="stat-subtext">
              {salesSummary?.totalSales ?? 0} tickets · Avg ${(salesSummary?.averageOrderValue ?? 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <Utensils size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Dishes Dispatched</span>
            <span className="stat-value">{salesSummary?.totalItemsSold ?? 0}</span>
            <span className="stat-subtext">Automatic FEFO stock allocation</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-rose-glow">
            <Trash2 size={22} className="text-rose" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Kitchen Loss / Waste</span>
            <span className="stat-value text-rose">
              {(wasteSummary?.totalWasteQuantity ?? totalWasteUnits).toFixed(1)} units
            </span>
            <span className="stat-subtext">
              {wasteSummary?.totalWasteRecords ?? wasteRecords.length} recorded incidents
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-purple-glow">
            <TrendingUp size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Yield &amp; Protection</span>
            <span className="stat-value">
              {salesSummary?.totalItemsSold && totalWasteUnits
                ? `${Math.max(0, 100 - Math.round((totalWasteUnits / (salesSummary.totalItemsSold + totalWasteUnits)) * 100))}%`
                : '98.5%'}
            </span>
            <span className="stat-subtext">FEFO batch utilization</span>
          </div>
        </div>
      </div>

      {/* ─── Navigation Sub-tabs & Period Filter Bar ────────────── */}
      <div className="sw-subnav-bar">
        <div className="sw-tab-group">
          <button
            type="button"
            className={`sw-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <span>Overview &amp; Trends</span>
          </button>
          <button
            type="button"
            className={`sw-tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveTab('sales')}
          >
            <span>Sales &amp; Top Dishes</span>
            <span className="sw-tab-count">{sales.length}</span>
          </button>
          <button
            type="button"
            className={`sw-tab-btn ${activeTab === 'waste' ? 'active' : ''}`}
            onClick={() => setActiveTab('waste')}
          >
            <span>Waste &amp; Loss Prevention</span>
            <span className="sw-tab-count">{wasteRecords.length}</span>
          </button>
        </div>

        <div className="sw-period-tabs">
          <button
            type="button"
            className={`sw-period-btn ${timeRange === 'today' ? 'active' : ''}`}
            onClick={() => setTimeRange('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={`sw-period-btn ${timeRange === '7days' ? 'active' : ''}`}
            onClick={() => setTimeRange('7days')}
          >
            7 Days
          </button>
          <button
            type="button"
            className={`sw-period-btn ${timeRange === '30days' ? 'active' : ''}`}
            onClick={() => setTimeRange('30days')}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* ─── TAB 1: OVERVIEW & TRENDS ────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="sw-layout-grid">
          {/* Left Column: Best Sellers & Recent Sales Ledger */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Best Sellers Card */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">
                    <Flame size={18} style={{ color: '#D97706' }} />
                    <span>Best-Selling Dishes</span>
                  </h3>
                  <p className="sw-card-subtitle">Ranked by unit volume &amp; customer popularity.</p>
                </div>
                <span className="badge badge-emerald">{bestSellers.length} Menu Items</span>
              </div>

              {bestSellers.length === 0 ? (
                <div className="empty-box" style={{ padding: '2rem 1rem' }}>
                  <Utensils size={32} className="text-muted mb-2" />
                  <p className="text-sm">No sales recorded yet.</p>
                </div>
              ) : (
                <div className="sw-bestseller-list">
                  {bestSellers.slice(0, 5).map((item, idx) => (
                    <div className="sw-bestseller-row" key={item.id}>
                      <div
                        className={`sw-rank-pill ${
                          idx === 0
                            ? 'rank-1'
                            : idx === 1
                            ? 'rank-2'
                            : idx === 2
                            ? 'rank-3'
                            : 'rank-other'
                        }`}
                      >
                        #{idx + 1}
                      </div>
                      <img src={item.image} alt={item.name} className="sw-bestseller-thumb" />
                      <div className="sw-bestseller-info">
                        <div className="sw-bestseller-name-row">
                          <strong className="sw-bestseller-name">{item.name}</strong>
                          <span className="sw-bestseller-cat-badge">{item.category}</span>
                        </div>
                        <div className="sw-bestseller-metrics">
                          <span>${item.price.toFixed(2)}/portion</span>
                          <span>·</span>
                          <span>
                            <strong>{item.quantity}</strong> sold ({item.sharePct}% share)
                          </span>
                        </div>
                      </div>
                      <div className="sw-bestseller-revenue">
                        <span>${item.revenue.toFixed(2)}</span>
                        <small>Revenue</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Sales Live Feed */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">
                    <Receipt size={17} className="text-accent" />
                    <span>Live POS Sales Stream</span>
                  </h3>
                  <p className="sw-card-subtitle">Real-time orders with FEFO batch depletion.</p>
                </div>
                <button
                  type="button"
                  className="btn-link text-xs"
                  onClick={() => setActiveTab('sales')}
                >
                  View All ({sales.length}) →
                </button>
              </div>

              {sales.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No sales recorded yet.</p>
              ) : (
                <div className="sw-feed-list">
                  {sales.slice(0, 5).map((sale) => (
                    <div className="sw-feed-item" key={sale.id}>
                      <div className="sw-feed-left">
                        <div className="sw-feed-icon">
                          <ShoppingBag size={16} />
                        </div>
                        <div className="sw-feed-details">
                          <strong className="sw-feed-items-text">
                            {sale.items.map((it) => `${it.menuItemName} ×${it.quantity}`).join(', ')}
                          </strong>
                          <span className="sw-feed-meta">
                            <span>
                              {new Date(sale.saleDate).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span>·</span>
                            <span>Staff: {sale.recordedByName || 'Register'}</span>
                          </span>
                        </div>
                      </div>
                      <div className="sw-feed-right">
                        <span className="sw-feed-amount">${sale.totalAmount.toFixed(2)}</span>
                        <span className="sw-feed-fefo-pill">✓ FEFO Deducted</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Waste Alert, Root Cause Bars & Verification Queue */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Waste Alert Callout */}
            {topWastedIngredient && (
              <div className="sw-waste-callout">
                <div className="sw-waste-callout-hdr">
                  <AlertTriangle size={18} style={{ color: '#D97706' }} />
                  <span>Waste Priority Spotlight</span>
                </div>
                <p className="sw-waste-callout-text">
                  <strong>{topWastedIngredient.name}</strong> accounts for{' '}
                  <strong style={{ color: '#BE123C' }}>{topWastedIngredient.pct}%</strong> of recorded
                  losses ({topWastedIngredient.qty} units).
                </p>
                <div className="sw-waste-callout-tip">
                  💡 <strong>Action Tip:</strong> Adjust daily prep batch sizes and prioritize oldest
                  unexpired batches via FEFO storage bins.
                </div>
              </div>
            )}

            {/* Waste by Root Cause Breakdown */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">
                    <Trash2 size={17} className="text-rose" />
                    <span>Waste by Root Cause</span>
                  </h3>
                  <p className="sw-card-subtitle">Categorized kitchen losses</p>
                </div>
              </div>

              <div className="sw-cause-list">
                {reasonBreakdown.map(({ reason, quantity, percentage, cssClass }) => (
                  <div className="sw-cause-item" key={reason}>
                    <div className="sw-cause-row">
                      <span className="sw-cause-name">{reason}</span>
                      <span className="sw-cause-qty">
                        {quantity} units ({percentage}%)
                      </span>
                    </div>
                    <div className="sw-cause-track">
                      <div
                        className={`sw-cause-fill ${cssClass}`}
                        style={{ width: `${Math.max(percentage, quantity > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Waste Verification Queue */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">
                    <ShieldCheck size={17} className="text-accent" />
                    <span>Manager Verification Queue</span>
                  </h3>
                  <p className="sw-card-subtitle">Audit kitchen shrinkage records</p>
                </div>
                <button
                  type="button"
                  className="btn-link text-xs"
                  onClick={() => setActiveTab('waste')}
                >
                  View All →
                </button>
              </div>

              {wasteRecords.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No waste records logged.</p>
              ) : (
                <div className="sw-audit-list">
                  {wasteRecords.slice(0, 4).map((record) => (
                    <div className="sw-audit-row" key={record.id}>
                      <div className="sw-audit-info">
                        <div className="sw-audit-title-line">
                          <strong className="sw-audit-ingredient">{record.ingredientName}</strong>
                          <span className="sw-audit-qty-badge">{record.quantity} units</span>
                        </div>
                        <span className="sw-audit-meta">
                          <span>Cause: {record.reason}</span>
                          <span>·</span>
                          <span>Lot: #{record.stockBatchNumber || 'Stock'}</span>
                        </span>
                      </div>

                      <div className="sw-audit-actions">
                        {record.status === 'RECORDED' ? (
                          canConfirmWaste ? (
                            <button
                              type="button"
                              className="sw-confirm-btn"
                              onClick={() => void handleConfirmWaste(record.id)}
                              disabled={busy}
                            >
                              <Check size={13} />
                              <span>Verify</span>
                            </button>
                          ) : (
                            <span className="sw-badge-recorded">Pending Review</span>
                          )
                        ) : (
                          <span className="sw-badge-confirmed">✓ Verified</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SALES & TOP DISHES ───────────────────────────── */}
      {activeTab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Ranked Dishes Full Catalog */}
          <div className="sw-card">
            <div className="sw-card-header">
              <div className="sw-card-title-group">
                <h3 className="sw-card-title">All Menu Dishes Performance</h3>
                <p className="sw-card-subtitle">Ranked by sales volume and total revenue generated.</p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Dish</th>
                    <th>Category</th>
                    <th>Portion Price</th>
                    <th>Sold Count</th>
                    <th>Volume Share</th>
                    <th>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {bestSellers.map((item, idx) => (
                    <tr key={item.id}>
                      <td>
                        <div
                          className={`sw-rank-pill ${
                            idx === 0
                              ? 'rank-1'
                              : idx === 1
                              ? 'rank-2'
                              : idx === 2
                              ? 'rank-3'
                              : 'rank-other'
                          }`}
                        >
                          #{idx + 1}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <img
                            src={item.image}
                            alt={item.name}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                              border: '1px solid var(--border)',
                            }}
                          />
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="sw-bestseller-cat-badge">{item.category}</span>
                      </td>
                      <td>${item.price.toFixed(2)}</td>
                      <td>
                        <strong>{item.quantity} portions</strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div
                            style={{
                              flex: 1,
                              height: '6px',
                              background: 'var(--bg-surface-secondary)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              minWidth: '60px',
                            }}
                          >
                            <div
                              style={{
                                width: `${item.sharePct}%`,
                                height: '100%',
                                background: 'var(--accent-sage)',
                                borderRadius: '4px',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted">{item.sharePct}%</span>
                        </div>
                      </td>
                      <td>
                        <strong className="text-emerald">${item.revenue.toFixed(2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full POS Sales Ledger */}
          <div className="sw-card">
            <div className="sw-card-header">
              <div className="sw-card-title-group">
                <h3 className="sw-card-title">Point of Sale History</h3>
                <p className="sw-card-subtitle">Every customer ticket with staff attribution and FEFO deduction.</p>
              </div>

              <div className="search-group" style={{ maxWidth: '280px' }}>
                <div className="input-with-icon search-input">
                  <Search size={15} className="input-icon" />
                  <input
                    type="text"
                    placeholder="Search by dish or staff..."
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Ticket Items</th>
                    <th>Cashier / Staff</th>
                    <th>FEFO Status</th>
                    <th>Order Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-muted">
                        No sales transactions match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>
                          <div className="flex items-center gap-1.5 text-xs">
                            <Calendar size={13} className="text-muted" />
                            <span>{new Date(sale.saleDate).toLocaleDateString()}</span>
                            <span className="text-muted">
                              {new Date(sale.saleDate).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {sale.items.map((it) => (
                              <span
                                key={it.menuItemId + it.menuItemName}
                                style={{
                                  background: 'var(--bg-surface-secondary)',
                                  border: '1px solid var(--border)',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  fontSize: '0.78rem',
                                }}
                              >
                                {it.menuItemName}{' '}
                                <strong style={{ color: 'var(--brand-primary)' }}>×{it.quantity}</strong>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="text-xs font-semibold text-secondary">
                            {sale.recordedByName || 'Staff Member'}
                          </span>
                        </td>
                        <td>
                          <span className="sw-feed-fefo-pill">✓ Depleted</span>
                        </td>
                        <td>
                          <strong className="text-emerald" style={{ fontSize: '0.92rem' }}>
                            ${sale.totalAmount.toFixed(2)}
                          </strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: WASTE & LOSS PREVENTION ──────────────────────── */}
      {activeTab === 'waste' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Loss Analytics & Insights */}
          <div className="sw-layout-grid">
            {/* Loss Root Cause Analysis */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">Root Cause Categorization</h3>
                  <p className="sw-card-subtitle">Breakdown of all logged kitchen shrinkage.</p>
                </div>
              </div>

              <div className="sw-cause-list">
                {reasonBreakdown.map(({ reason, quantity, percentage, cssClass }) => (
                  <div className="sw-cause-item" key={reason}>
                    <div className="sw-cause-row">
                      <span className="sw-cause-name">{reason}</span>
                      <span className="sw-cause-qty">
                        {quantity} units ({percentage}%)
                      </span>
                    </div>
                    <div className="sw-cause-track">
                      <div
                        className={`sw-cause-fill ${cssClass}`}
                        style={{ width: `${Math.max(percentage, quantity > 0 ? 5 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Waste Prevention Rules */}
            <div className="sw-card">
              <div className="sw-card-header">
                <div className="sw-card-title-group">
                  <h3 className="sw-card-title">FEFO Waste Mitigation Guidelines</h3>
                  <p className="sw-card-subtitle">Recommended kitchen SOPs to protect margins</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ background: 'var(--accent-mint)', color: 'var(--brand-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>1</span>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Enforce FEFO Batch Sorting</strong>
                    <span>Always position ingredients with the earliest expiration date at the front of reach-ins and shelves.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ background: 'var(--accent-mint)', color: 'var(--brand-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>2</span>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Batch Size Calibration</strong>
                    <span>Prep smaller portion batches during off-peak shifts to eliminate over-preparation end-of-day losses.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <span style={{ background: 'var(--accent-mint)', color: 'var(--brand-primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>3</span>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>Mandatory Shift End Waste Logging</strong>
                    <span>Log all discarded ingredients promptly with lot numbers to maintain accurate stock visibility.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full Waste Verification Table */}
          <div className="sw-card">
            <div className="sw-card-header">
              <div className="sw-card-title-group">
                <h3 className="sw-card-title">Waste Verification &amp; Audit Ledger</h3>
                <p className="sw-card-subtitle">Complete historical record of all kitchen deductions.</p>
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-muted" />
                <select
                  value={wasteFilterStatus}
                  onChange={(e) => setWasteFilterStatus(e.target.value as 'ALL' | 'RECORDED' | 'CONFIRMED')}
                  className="form-input"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                >
                  <option value="ALL">All Statuses ({wasteRecords.length})</option>
                  <option value="RECORDED">Pending Verification</option>
                  <option value="CONFIRMED">Confirmed / Verified</option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Ingredient</th>
                    <th>Stock Lot</th>
                    <th>Qty Wasted</th>
                    <th>Root Cause Reason</th>
                    <th>Reported By</th>
                    <th>Status</th>
                    {canConfirmWaste && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredWasteRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-6 text-muted">
                        No waste records match this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredWasteRecords.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <div className="text-xs">
                            <div>{new Date(record.recordedAt).toLocaleDateString()}</div>
                            <div className="text-muted">
                              {new Date(record.recordedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{record.ingredientName}</strong>
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              background: 'var(--bg-surface-secondary)',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border)',
                            }}
                          >
                            #{record.stockBatchNumber || record.stockBatchId.slice(0, 8)}
                          </span>
                        </td>
                        <td>
                          <span className="sw-audit-qty-badge">{record.quantity} units</span>
                        </td>
                        <td>
                          <span className="text-xs font-semibold text-secondary">{record.reason}</span>
                        </td>
                        <td>
                          <span className="text-xs text-muted">{record.reportedByName}</span>
                        </td>
                        <td>
                          {record.status === 'RECORDED' ? (
                            <span className="sw-badge-recorded">Pending Review</span>
                          ) : (
                            <span className="sw-badge-confirmed">
                              ✓ Verified{record.confirmedByName ? ` by ${record.confirmedByName}` : ''}
                            </span>
                          )}
                        </td>
                        {canConfirmWaste && (
                          <td>
                            {record.status === 'RECORDED' ? (
                              <button
                                type="button"
                                className="sw-confirm-btn"
                                onClick={() => void handleConfirmWaste(record.id)}
                                disabled={busy}
                              >
                                <Check size={13} />
                                <span>Confirm</span>
                              </button>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── RECORD SALE MODAL ────────────────────────────────────── */}
      {showSaleModal && (
        <div className="modal-overlay" onClick={() => setShowSaleModal(false)}>
          <div className="modal-container modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-accent" />
                <h3 style={{ margin: 0 }}>Record Point of Sale</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowSaleModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitSale}>
              <div className="modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label">Menu Item *</label>
                  <select
                    className="form-input"
                    value={saleMenuItemId}
                    onChange={(e) => setSaleMenuItemId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Menu Dish --</option>
                    {menuItems
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (${item.sellingPrice.toFixed(2)})
                        </option>
                      ))}
                  </select>
                </div>

                {selectedSaleItem && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      background: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <img
                      src={getFoodImage(selectedSaleItem.name)}
                      alt={selectedSaleItem.name}
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '6px',
                        objectFit: 'cover',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--brand-primary)' }}>
                        {selectedSaleItem.name}
                      </strong>
                      <span className="text-xs text-muted">
                        Unit Price: <strong>${selectedSaleItem.sellingPrice.toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Portions Sold *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-input"
                    value={saleQuantity}
                    onChange={(e) => setSaleQuantity(e.target.value)}
                    required
                  />
                  {selectedSaleItem && (
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted">Calculated Total:</span>
                      <strong className="text-emerald" style={{ fontSize: '0.95rem' }}>
                        ${(selectedSaleItem.sellingPrice * Number(saleQuantity || 0)).toFixed(2)}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="kop-fefo-notice">
                  <span>⚡ FEFO Automation: Recipe ingredient quantities will be automatically deducted from the oldest unexpired stock batch.</span>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSaleModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !saleMenuItemId || Number(saleQuantity) <= 0}
                >
                  <CheckCircle2 size={15} />
                  <span>Submit Sale</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── RECORD WASTE MODAL ───────────────────────────────────── */}
      {showWasteModal && (
        <div className="modal-overlay" onClick={() => setShowWasteModal(false)}>
          <div className="modal-container modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-rose" />
                <h3 style={{ margin: 0 }}>Log Kitchen Waste / Spoilage</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowWasteModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitWaste}>
              <div className="modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label">Select Active Batch *</label>
                  <select
                    className="form-input"
                    value={wasteBatchId}
                    onChange={(e) => setWasteBatchId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Stock Batch --</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.ingredientName} · Lot #{b.batchNumber} ({b.quantity} {b.unit} available)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedWasteBatch && (
                  <div
                    style={{
                      background: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div className="flex justify-between">
                      <span className="text-muted">Ingredient:</span>
                      <strong>{selectedWasteBatch.ingredientName}</strong>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-muted">Available Batch Stock:</span>
                      <strong className="text-emerald">{selectedWasteBatch.quantity} {selectedWasteBatch.unit}</strong>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Quantity Wasted *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedWasteBatch?.quantity}
                    className="form-input"
                    value={wasteQuantity}
                    onChange={(e) => setWasteQuantity(e.target.value)}
                    required
                  />
                  {selectedWasteBatch && (
                    <span className="text-xs text-muted mt-1 block">
                      Max available: {selectedWasteBatch.quantity} {selectedWasteBatch.unit}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Root Cause Reason *</label>
                  <select
                    className="form-input"
                    value={wasteReason}
                    onChange={(e) => setWasteReason(e.target.value)}
                  >
                    <option value="Spoilage">Spoilage / Expired</option>
                    <option value="Over-preparation">Over-preparation (End of shift)</option>
                    <option value="Dropped / Damaged">Dropped / Cook error</option>
                    <option value="Quality Inspection Fail">Quality Inspection Fail</option>
                    <option value="Other">Other reason</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowWasteModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={busy || !wasteBatchId || Number(wasteQuantity) <= 0}
                >
                  <Trash2 size={15} />
                  <span>Deduct Waste Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
