import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Flame,
  Layers,
  PieChart,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type {
  CreateSaleRequest,
  InventoryResponse,
  MenuItemResponse,
  RecipeResponse,
  SaleResponse,
  SalesSummaryResponse,
  WasteRecordResponse,
  WasteSummaryResponse,
} from '../types';

const formatCurrency = (val: number): string =>
  '$' +
  Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

export const SalesWasteDashboard: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [sales, setSales] = useState<SaleResponse[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecordResponse[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [wasteSummary, setWasteSummary] = useState<WasteSummaryResponse | null>(null);
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saleMenuItemId, setSaleMenuItemId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState('1');
  const [wasteBatchId, setWasteBatchId] = useState('');
  const [wasteQuantity, setWasteQuantity] = useState('1');
  const [wasteReason, setWasteReason] = useState('Spoilage');
  const [busy, setBusy] = useState(false);

  // View mode tab state
  const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'OPERATIONS' | 'ALL'>('ANALYTICS');
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [activeDonutIdx, setActiveDonutIdx] = useState<number | null>(null);
  const [showAllAtRisk, setShowAllAtRisk] = useState(false);

  const canRecordSale = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF'].includes(user?.role ?? '');
  const canRecordWaste = ['SALES_KITCHEN_STAFF', 'RESTAURANT_MANAGER', 'INVENTORY_MANAGER'].includes(user?.role ?? '');
  const canConfirmWaste = ['INVENTORY_MANAGER', 'RESTAURANT_MANAGER'].includes(user?.role ?? '');

  const batches = useMemo(
    () =>
      inventory
        .flatMap((item) =>
          item.batches.map((batch) => ({
            ...batch,
            ingredientName: item.ingredientName,
            unit: item.unit,
            sku: item.sku,
          }))
        )
        .filter((batch) => batch.quantity > 0),
    [inventory]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, recipeData, salesData, salesStats, wasteData, wasteStats, inventoryData] =
        await Promise.all([
          api.getMenuItems(),
          api.getRecipes(),
          api.getSales(),
          api.getSalesSummary(),
          api.getWasteRecords(),
          api.getWasteSummary(),
          api.getInventory(),
        ]);
      setMenuItems(menu);
      setRecipes(recipeData);
      setSales(salesData);
      setSalesSummary(salesStats);
      setWasteRecords(wasteData);
      setWasteSummary(wasteStats);
      setInventory(inventoryData);
      setSaleMenuItemId((current) => current || menu.find((item) => item.isActive)?.id || '');
      const firstBatch = inventoryData
        .flatMap((item) => item.batches)
        .find((batch) => batch.quantity > 0);
      setWasteBatchId((current) => current || firstBatch?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales and waste data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await loadData();
    };
    void load();
  }, [loadData]);

  // ─── Financial & Analytical Calculations ─────────────────────────────────

  // Map of batch & ingredient unit costs for accurate loss calculations
  const batchCostLookup = useMemo(() => {
    const idMap = new Map<string, number>();
    const numMap = new Map<string, number>();
    const ingAvgMap = new Map<string, { total: number; count: number }>();

    for (const item of inventory) {
      for (const b of item.batches) {
        if (b.id && b.unitCost > 0) idMap.set(b.id, b.unitCost);
        if (b.batchNumber && b.unitCost > 0) numMap.set(b.batchNumber, b.unitCost);
        if (b.unitCost && b.unitCost > 0) {
          const cur = ingAvgMap.get(item.ingredientId) || { total: 0, count: 0 };
          cur.total += b.unitCost;
          cur.count += 1;
          ingAvgMap.set(item.ingredientId, cur);
        }
      }
    }
    return { idMap, numMap, ingAvgMap };
  }, [inventory]);

  const getRecordCost = useCallback(
    (record: WasteRecordResponse): number => {
      let cost =
        batchCostLookup.idMap.get(record.stockBatchId) ??
        batchCostLookup.numMap.get(record.stockBatchNumber);

      if (cost === undefined || cost === 0) {
        const avg = batchCostLookup.ingAvgMap.get(record.ingredientId);
        cost = avg && avg.count > 0 ? avg.total / avg.count : 0;
      }

      if (!cost || cost === 0) {
        cost = 4.25; // Sensible standard default unit price fallback
      }
      return Number(record.quantity || 0) * cost;
    },
    [batchCostLookup]
  );

  // Aggregated KPI numbers
  const totalRevenue = useMemo(() => {
    return salesSummary?.totalRevenue ?? sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [salesSummary, sales]);

  const totalWasteCost = useMemo(() => {
    return wasteRecords.reduce((sum, r) => sum + getRecordCost(r), 0);
  }, [wasteRecords, getRecordCost]);

  const totalWasteQuantity = useMemo(() => {
    return wasteSummary?.totalWasteQuantity ?? wasteRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
  }, [wasteSummary, wasteRecords]);

  const wasteToSalesRatio = useMemo(() => {
    return totalRevenue > 0 ? (totalWasteCost / totalRevenue) * 100 : 0;
  }, [totalWasteCost, totalRevenue]);

  const netRealizedRevenue = useMemo(() => {
    return Math.max(0, totalRevenue - totalWasteCost);
  }, [totalRevenue, totalWasteCost]);

  // ─── Chart 1: Daily Revenue vs. Waste Trend ──────────────────────────────
  const dailyTrend = useMemo(() => {
    const datesSet = new Set<string>();
    const now = new Date();

    // Ensure last 7 days exist
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      datesSet.add(d.toISOString().split('T')[0]);
    }

    for (const s of sales) {
      if (s.saleDate) datesSet.add(s.saleDate.split('T')[0]);
    }
    for (const w of wasteRecords) {
      if (w.recordedAt) datesSet.add(w.recordedAt.split('T')[0]);
    }

    const sorted = Array.from(datesSet).sort().slice(-8);

    return sorted.map((dateStr) => {
      const daySales = sales.filter((s) => s.saleDate && s.saleDate.startsWith(dateStr));
      const dayWastes = wasteRecords.filter((w) => w.recordedAt && w.recordedAt.startsWith(dateStr));

      const rev = daySales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const wasteLoss = dayWastes.reduce((sum, w) => sum + getRecordCost(w), 0);
      const dObj = new Date(dateStr + 'T12:00:00');
      const label = dObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      return {
        date: dateStr,
        label,
        revenue: rev,
        waste: wasteLoss,
        net: Math.max(0, rev - wasteLoss),
      };
    });
  }, [sales, wasteRecords, getRecordCost]);

  // ─── Chart 2: Root-Cause Donut Breakdown ──────────────────────────────────
  const wasteByReason = useMemo(() => {
    const map = new Map<string, { reason: string; count: number; cost: number; quantity: number }>();
    const palette = ['#e11d48', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981'];

    for (const w of wasteRecords) {
      const reason = w.reason?.trim() || 'Unspecified';
      const cur = map.get(reason) || { reason, count: 0, cost: 0, quantity: 0 };
      cur.count += 1;
      cur.quantity += w.quantity || 0;
      cur.cost += getRecordCost(w);
      map.set(reason, cur);
    }

    const list = Array.from(map.values()).sort((a, b) => b.cost - a.cost);
    const sumCost = list.reduce((sum, x) => sum + x.cost, 0);

    return list.map((item, idx) => ({
      ...item,
      percentage: sumCost > 0 ? (item.cost / sumCost) * 100 : 0,
      color: palette[idx % palette.length],
    }));
  }, [wasteRecords, getRecordCost]);

  // ─── Chart 3: Top 5 Costliest Wasted Ingredients ─────────────────────────
  const topWastedIngredients = useMemo(() => {
    const map = new Map<string, { name: string; cost: number; quantity: number; unit: string }>();

    for (const w of wasteRecords) {
      const name = w.ingredientName || 'Unknown Ingredient';
      const b = batches.find((x) => x.id === w.stockBatchId || x.batchNumber === w.stockBatchNumber);
      const unit = b?.unit || 'units';

      const cur = map.get(name) || { name, cost: 0, quantity: 0, unit };
      cur.cost += getRecordCost(w);
      cur.quantity += w.quantity || 0;
      map.set(name, cur);
    }

    const list = Array.from(map.values()).sort((a, b) => b.cost - a.cost).slice(0, 5);
    const maxVal = list.length > 0 ? list[0].cost : 1;

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      percentOfMax: maxVal > 0 ? (item.cost / maxVal) * 100 : 0,
      shareOfTotal: totalWasteCost > 0 ? (item.cost / totalWasteCost) * 100 : 0,
    }));
  }, [wasteRecords, batches, getRecordCost, totalWasteCost]);

  // ─── Chart 4: 72-Hour Expiration Risk Horizon ────────────────────────────
  const expiryHorizon = useMemo(() => {
    const now = Date.now();
    const critical: { batch: (typeof batches)[0]; hoursLeft: number; value: number }[] = [];
    const urgent: { batch: (typeof batches)[0]; hoursLeft: number; value: number }[] = [];
    const watchlist: { batch: (typeof batches)[0]; hoursLeft: number; value: number }[] = [];
    let stableValue = 0;
    let stableCount = 0;

    for (const b of batches) {
      const value = (b.quantity || 0) * (b.unitCost || 0);
      if (!b.expiryDate) {
        stableValue += value;
        stableCount += 1;
        continue;
      }

      const expTime = new Date(b.expiryDate).getTime();
      const diffHours = (expTime - now) / (1000 * 60 * 60);

      if (diffHours <= 24) {
        critical.push({ batch: b, hoursLeft: Math.max(0, Math.round(diffHours)), value });
      } else if (diffHours <= 48) {
        urgent.push({ batch: b, hoursLeft: Math.round(diffHours), value });
      } else if (diffHours <= 72) {
        watchlist.push({ batch: b, hoursLeft: Math.round(diffHours), value });
      } else {
        stableValue += value;
        stableCount += 1;
      }
    }

    const criticalVal = critical.reduce((s, x) => s + x.value, 0);
    const urgentVal = urgent.reduce((s, x) => s + x.value, 0);
    const watchlistVal = watchlist.reduce((s, x) => s + x.value, 0);
    const totalVal = criticalVal + urgentVal + watchlistVal + stableValue;

    return {
      critical,
      criticalVal,
      urgent,
      urgentVal,
      watchlist,
      watchlistVal,
      stableValue,
      stableCount,
      totalVal,
      totalAtRisk: criticalVal + urgentVal + watchlistVal,
      atRiskCount: critical.length + urgent.length + watchlist.length,
    };
  }, [batches]);

  // Form Submissions
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
      setNotice('Sale recorded and inventory consumed through FEFO.');
      setSaleQuantity('1');
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
      setNotice('Waste recorded and the selected batch was reduced.');
      setWasteQuantity('1');
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
      setNotice('Waste record confirmed.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm waste.');
    } finally {
      setBusy(false);
    }
  };

  // Speedometer calculation
  const clampedGaugeRatio = Math.min(10, Math.max(0, wasteToSalesRatio));
  const gaugeAngle = -180 + (clampedGaugeRatio / 10) * 180;
  const needleRad = (gaugeAngle * Math.PI) / 180;
  const needleX = 100 + 55 * Math.cos(needleRad);
  const needleY = 95 + 55 * Math.sin(needleRad);

  return (
    <div className="view-container">
      {/* Hero Header */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Sales, Revenue & Waste Loss Intelligence</h2>
          <p>
            Monitor real-time sales revenue, track food waste dollar loss, analyze root-causes,
            and prevent imminent batch expirations before food turns to waste.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadData()}
          disabled={loading || busy}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {notice && (
        <div className="alert-success">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}

      {/* 5 Executive KPI Cards */}
      <div className="sw-stats-grid">
        {/* Card 1: Gross Revenue */}
        <div className="sw-stat-card card-revenue">
          <div className="sw-stat-icon-wrap" style={{ background: '#ecfdf5', color: '#059669' }}>
            <DollarSign size={22} />
          </div>
          <div className="sw-stat-body">
            <span className="sw-stat-label">Gross Revenue</span>
            <span className="sw-stat-val" style={{ color: '#047857' }}>
              {formatCurrency(totalRevenue)}
            </span>
            <span className="sw-stat-sub">
              <strong>{salesSummary?.totalSales ?? sales.length}</strong> completed sales
            </span>
          </div>
        </div>

        {/* Card 2: Financial Waste Loss */}
        <div className="sw-stat-card card-waste">
          <div className="sw-stat-icon-wrap" style={{ background: '#fff1f2', color: '#e11d48' }}>
            <Trash2 size={22} />
          </div>
          <div className="sw-stat-body">
            <span className="sw-stat-label">Financial Waste Loss</span>
            <span className="sw-stat-val" style={{ color: '#be123c' }}>
              -{formatCurrency(totalWasteCost)}
            </span>
            <span className="sw-stat-sub">
              <strong>{wasteRecords.length}</strong> records · {formatQuantity(totalWasteQuantity)} units
            </span>
          </div>
        </div>

        {/* Card 3: Waste-to-Sales Ratio */}
        <div className="sw-stat-card card-ratio">
          <div
            className="sw-stat-icon-wrap"
            style={{
              background: wasteToSalesRatio <= 3 ? '#ecfdf5' : wasteToSalesRatio <= 5 ? '#fffbeb' : '#fff1f2',
              color: wasteToSalesRatio <= 3 ? '#059669' : wasteToSalesRatio <= 5 ? '#d97706' : '#e11d48',
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div className="sw-stat-body">
            <span className="sw-stat-label">Waste / Sales Ratio</span>
            <span
              className="sw-stat-val"
              style={{
                color: wasteToSalesRatio <= 3 ? '#059669' : wasteToSalesRatio <= 5 ? '#d97706' : '#e11d48',
              }}
            >
              {wasteToSalesRatio.toFixed(1)}%
            </span>
            <span className="sw-stat-sub">
              {wasteToSalesRatio <= 3 ? (
                <span className="badge badge-emerald">Optimal (&lt; 3%)</span>
              ) : wasteToSalesRatio <= 5 ? (
                <span className="badge badge-amber">Warning (3-5%)</span>
              ) : (
                <span className="badge badge-rose">High Loss (&gt; 5%)</span>
              )}
            </span>
          </div>
        </div>

        {/* Card 4: Net Realized Revenue */}
        <div className="sw-stat-card card-net">
          <div className="sw-stat-icon-wrap" style={{ background: '#f0f9ff', color: '#0284c7' }}>
            <TrendingUp size={22} />
          </div>
          <div className="sw-stat-body">
            <span className="sw-stat-label">Net Realized Revenue</span>
            <span className="sw-stat-val" style={{ color: '#0369a1' }}>
              {formatCurrency(netRealizedRevenue)}
            </span>
            <span className="sw-stat-sub">Gross minus recorded waste</span>
          </div>
        </div>

        {/* Card 5: 72h Expiry Risk */}
        <div className="sw-stat-card card-risk">
          <div className="sw-stat-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <AlertTriangle size={22} />
          </div>
          <div className="sw-stat-body">
            <span className="sw-stat-label">72h Expiry at Risk</span>
            <span className="sw-stat-val" style={{ color: '#6d28d9' }}>
              {formatCurrency(expiryHorizon.totalAtRisk)}
            </span>
            <span className="sw-stat-sub">
              <strong>{expiryHorizon.atRiskCount}</strong> batches expiring soon
            </span>
          </div>
        </div>
      </div>

      {/* View Mode Navigation Tabs */}
      <div className="sw-tab-nav">
        <button
          type="button"
          className={`sw-tab-btn ${activeTab === 'ANALYTICS' ? 'active' : ''}`}
          onClick={() => setActiveTab('ANALYTICS')}
        >
          <BarChart3 size={16} />
          <span>Visual Analytics & Loss Charts</span>
          <span className="sw-tab-badge">5 Visuals</span>
        </button>

        <button
          type="button"
          className={`sw-tab-btn ${activeTab === 'OPERATIONS' ? 'active' : ''}`}
          onClick={() => setActiveTab('OPERATIONS')}
        >
          <UtensilsCrossed size={16} />
          <span>Kitchen Operations & Entry</span>
        </button>

        <button
          type="button"
          className={`sw-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveTab('ALL')}
        >
          <Layers size={16} />
          <span>Unified Full View</span>
        </button>
      </div>

      {/* ─── SECTION 1: VISUAL ANALYTICS & CHARTS ─── */}
      {(activeTab === 'ANALYTICS' || activeTab === 'ALL') && (
        <>
          {/* Row 1: Dual-Axis Trend + Speedometer Dial */}
          <div className="sw-visuals-grid">
            {/* Chart 1: Daily Revenue vs. Waste Trend */}
            <div className="sw-panel-card">
              <div className="sw-panel-header">
                <div className="sw-panel-title-area">
                  <h3>
                    <BarChart3 size={18} className="text-accent" />
                    Daily Revenue vs. Waste Loss Trend
                  </h3>
                  <p>Compare gross daily income against financial food waste loss over time.</p>
                </div>
                <div className="sw-chart-legend">
                  <span className="sw-legend-item">
                    <span className="sw-legend-dot" style={{ background: '#10b981' }} />
                    Revenue
                  </span>
                  <span className="sw-legend-item">
                    <span className="sw-legend-dot" style={{ background: '#e11d48' }} />
                    Waste Loss
                  </span>
                </div>
              </div>

              {/* Responsive SVG Chart */}
              <div style={{ width: '100%', overflowX: 'auto' }}>
                {(() => {
                  const maxVal = Math.max(
                    100,
                    ...dailyTrend.map((d) => Math.max(d.revenue, d.waste * 2))
                  );
                  const chartW = 540;
                  const chartH = 200;
                  const padL = 50;
                  const padR = 20;
                  const padT = 20;
                  const padB = 35;
                  const plotW = chartW - padL - padR;
                  const plotH = chartH - padT - padB;
                  const stepX = dailyTrend.length > 0 ? plotW / dailyTrend.length : plotW;

                  // Compute line points for waste
                  const wastePoints = dailyTrend.map((d, i) => {
                    const x = padL + i * stepX + stepX / 2;
                    const y = padT + plotH - (d.waste / maxVal) * plotH;
                    return `${x},${y}`;
                  });

                  return (
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', minWidth: '460px', height: '210px' }}>
                      <defs>
                        <linearGradient id="revenueBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#059669" stopOpacity="0.4" />
                        </linearGradient>
                        <linearGradient id="wasteLineGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#e11d48" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#e11d48" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                        const y = padT + plotH * (1 - pct);
                        return (
                          <g key={idx}>
                            <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b" fontFamily="JetBrains Mono">
                              ${Math.round(maxVal * pct)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Revenue Bars */}
                      {dailyTrend.map((d, i) => {
                        const barW = Math.max(16, stepX * 0.45);
                        const x = padL + i * stepX + (stepX - barW) / 2;
                        const barH = (d.revenue / maxVal) * plotH;
                        const y = padT + plotH - barH;
                        const isHovered = hoveredTrendIdx === i;

                        return (
                          <g
                            key={i}
                            onMouseEnter={() => setHoveredTrendIdx(i)}
                            onMouseLeave={() => setHoveredTrendIdx(null)}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              x={x}
                              y={y}
                              width={barW}
                              height={Math.max(2, barH)}
                              rx="3"
                              fill="url(#revenueBarGrad)"
                              stroke={isHovered ? '#047857' : '#10b981'}
                              strokeWidth={isHovered ? 2 : 1}
                            />
                            {/* X-Axis Labels */}
                            <text
                              x={padL + i * stepX + stepX / 2}
                              y={chartH - 12}
                              textAnchor="middle"
                              fontSize="11"
                              fill={isHovered ? '#0f172a' : '#64748b'}
                              fontWeight={isHovered ? '700' : '500'}
                            >
                              {d.label}
                            </text>
                          </g>
                        );
                      })}

                      {/* Waste Line Path & Shaded Area */}
                      {wastePoints.length > 1 && (
                        <>
                          <path
                            d={`M ${padL + stepX / 2},${padT + plotH} L ${wastePoints.join(' L ')} L ${
                              padL + (dailyTrend.length - 1) * stepX + stepX / 2
                            },${padT + plotH} Z`}
                            fill="url(#wasteLineGrad)"
                          />
                          <path
                            d={`M ${wastePoints.join(' L ')}`}
                            fill="none"
                            stroke="#e11d48"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}

                      {/* Waste Line Dots */}
                      {dailyTrend.map((d, i) => {
                        const x = padL + i * stepX + stepX / 2;
                        const y = padT + plotH - (d.waste / maxVal) * plotH;
                        const isHovered = hoveredTrendIdx === i;

                        return (
                          <circle
                            key={i}
                            cx={x}
                            cy={y}
                            r={isHovered ? 6 : 4}
                            fill="#ffffff"
                            stroke="#e11d48"
                            strokeWidth={isHovered ? 3 : 2}
                            onMouseEnter={() => setHoveredTrendIdx(i)}
                            onMouseLeave={() => setHoveredTrendIdx(null)}
                            style={{ cursor: 'pointer' }}
                          />
                        );
                      })}

                      {/* Hover Tooltip Overlay */}
                      {hoveredTrendIdx !== null && dailyTrend[hoveredTrendIdx] && (
                        <g>
                          {(() => {
                            const d = dailyTrend[hoveredTrendIdx];
                            const tipX = Math.min(chartW - 130, Math.max(padL + 10, padL + hoveredTrendIdx * stepX - 40));
                            return (
                              <g transform={`translate(${tipX}, 20)`}>
                                <rect width="130" height="65" rx="6" fill="#0f172a" fillOpacity="0.9" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.2))" />
                                <text x="10" y="16" fontSize="11" fill="#cbd5e1" fontWeight="700">
                                  {d.label}
                                </text>
                                <text x="10" y="32" fontSize="11" fill="#34d399">
                                  Rev: {formatCurrency(d.revenue)}
                                </text>
                                <text x="10" y="47" fontSize="11" fill="#f87171">
                                  Waste: -{formatCurrency(d.waste)}
                                </text>
                                <text x="10" y="59" fontSize="10" fill="#94a3b8">
                                  Net: {formatCurrency(d.net)}
                                </text>
                              </g>
                            );
                          })()}
                        </g>
                      )}
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* Gauge: Waste Efficiency Speedometer */}
            <div className="sw-panel-card">
              <div className="sw-panel-header">
                <div className="sw-panel-title-area">
                  <h3>
                    <ShieldAlert size={18} className="text-rose" />
                    Efficiency Health Dial
                  </h3>
                  <p>Waste-to-revenue efficiency index.</p>
                </div>
              </div>

              <div className="sw-gauge-container">
                <svg viewBox="0 0 200 120" style={{ width: '100%', maxWidth: '220px' }}>
                  {/* Background Arc: Green (<3%) */}
                  <path
                    d="M 30,95 A 70,70 0 0,1 62,40"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  {/* Background Arc: Amber (3-5%) */}
                  <path
                    d="M 66,36 A 70,70 0 0,1 115,26"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="14"
                  />
                  {/* Background Arc: Red (>5%) */}
                  <path
                    d="M 120,27 A 70,70 0 0,1 170,95"
                    fill="none"
                    stroke="#e11d48"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />

                  {/* Indicator Needle */}
                  <line
                    x1="100"
                    y1="95"
                    x2={needleX}
                    y2={needleY}
                    stroke="#0f172a"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx="100" cy="95" r="7" fill="#0f172a" />
                  <circle cx="100" cy="95" r="3" fill="#ffffff" />
                </svg>

                <div className="sw-gauge-score">
                  <span
                    className="sw-gauge-value"
                    style={{
                      color:
                        wasteToSalesRatio <= 3
                          ? '#059669'
                          : wasteToSalesRatio <= 5
                          ? '#d97706'
                          : '#e11d48',
                    }}
                  >
                    {wasteToSalesRatio.toFixed(1)}%
                  </span>
                  <div>
                    <span
                      className="sw-gauge-badge"
                      style={{
                        background:
                          wasteToSalesRatio <= 3
                            ? '#ecfdf5'
                            : wasteToSalesRatio <= 5
                            ? '#fffbeb'
                            : '#fff1f2',
                        color:
                          wasteToSalesRatio <= 3
                            ? '#047857'
                            : wasteToSalesRatio <= 5
                            ? '#b45309'
                            : '#be123c',
                        border:
                          wasteToSalesRatio <= 3
                            ? '1px solid #a7f3d0'
                            : wasteToSalesRatio <= 5
                            ? '1px solid #fde68a'
                            : '1px solid #fecdd3',
                      }}
                    >
                      {wasteToSalesRatio <= 3
                        ? 'Optimal Margin Control'
                        : wasteToSalesRatio <= 5
                        ? 'Caution: Waste Creeping'
                        : 'Critical Food Loss'}
                    </span>
                  </div>
                </div>

                <div className="sw-gauge-note">
                  Industry target: <strong>&lt; 3.0%</strong>. Currently generating{' '}
                  <strong>{formatCurrency(totalWasteCost)}</strong> in scrap/spoilage.
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Root-Cause Donut + Top 5 Money Drains */}
          <div className="sw-visuals-grid-equal">
            {/* Chart 2: Root-Cause Donut */}
            <div className="sw-panel-card">
              <div className="sw-panel-header">
                <div className="sw-panel-title-area">
                  <h3>
                    <PieChart size={18} className="text-purple" />
                    Waste Loss by Root Cause
                  </h3>
                  <p>Distribution of financial losses grouped by recorded reason.</p>
                </div>
              </div>

              {wasteByReason.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  No waste records available for breakdown.
                </div>
              ) : (
                <div className="sw-donut-layout">
                  {/* SVG Donut */}
                  <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
                    {(() => {
                      const radius = 65;
                      const circum = 2 * Math.PI * radius;
                      let accumulatedPct = 0;

                      return (
                        <svg viewBox="0 0 180 180" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                          {wasteByReason.map((slice, idx) => {
                            const strokeLen = (slice.percentage / 100) * circum;
                            const offset = -((accumulatedPct / 100) * circum);
                            accumulatedPct += slice.percentage;
                            const isHovered = activeDonutIdx === idx;

                            return (
                              <circle
                                key={idx}
                                cx="90"
                                cy="90"
                                r={radius}
                                fill="transparent"
                                stroke={slice.color}
                                strokeWidth={isHovered ? 26 : 20}
                                strokeDasharray={`${strokeLen} ${circum}`}
                                strokeDashoffset={offset}
                                onMouseEnter={() => setActiveDonutIdx(idx)}
                                onMouseLeave={() => setActiveDonutIdx(null)}
                                style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                              />
                            );
                          })}
                        </svg>
                      );
                    })()}

                    {/* Donut Center Text */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        textAlign: 'center',
                      }}
                    >
                      {activeDonutIdx !== null && wasteByReason[activeDonutIdx] ? (
                        <>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                            {wasteByReason[activeDonutIdx].reason}
                          </span>
                          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e11d48' }}>
                            {formatCurrency(wasteByReason[activeDonutIdx].cost)}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700 }}>
                            {wasteByReason[activeDonutIdx].percentage.toFixed(1)}%
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                            Total Lost
                          </span>
                          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#e11d48' }}>
                            {formatCurrency(totalWasteCost)}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {wasteRecords.length} records
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Donut Legend */}
                  <div className="sw-donut-legend">
                    {wasteByReason.map((slice, idx) => (
                      <div
                        key={idx}
                        className={`sw-donut-legend-row ${activeDonutIdx === idx ? 'active' : ''}`}
                        onMouseEnter={() => setActiveDonutIdx(idx)}
                        onMouseLeave={() => setActiveDonutIdx(null)}
                      >
                        <div className="sw-donut-legend-left">
                          <span className="sw-legend-dot" style={{ background: slice.color }} />
                          <span className="sw-donut-legend-name">{slice.reason}</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({slice.count})</span>
                        </div>
                        <div>
                          <span className="sw-donut-legend-cost">
                            {formatCurrency(slice.cost)}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '6px' }}>
                            {slice.percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chart 3: Top 5 Money Drains (Pareto) */}
            <div className="sw-panel-card">
              <div className="sw-panel-header">
                <div className="sw-panel-title-area">
                  <h3>
                    <Flame size={18} className="text-rose" />
                    Top 5 Costliest Wasted Ingredients
                  </h3>
                  <p>Highest dollar-value losses in inventory.</p>
                </div>
              </div>

              {topWastedIngredients.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  No waste records recorded yet.
                </div>
              ) : (
                <div className="sw-drains-list">
                  {topWastedIngredients.map((item) => (
                    <div className="sw-drain-item" key={item.name}>
                      <div className="sw-drain-top-row">
                        <div className="sw-drain-name-wrap">
                          <span className="sw-drain-rank">{item.rank}</span>
                          <span className="sw-drain-name">{item.name}</span>
                          <span className="sw-drain-qty">
                            ({formatQuantity(item.quantity)} {item.unit})
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="sw-drain-cost">-{formatCurrency(item.cost)}</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '6px' }}>
                            ({item.shareOfTotal.toFixed(0)}% share)
                          </span>
                        </div>
                      </div>
                      <div className="sw-drain-bar-track">
                        <div
                          className="sw-drain-bar-fill"
                          style={{ width: `${Math.max(8, item.percentOfMax)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: 72-Hour Expiration Risk Horizon */}
          <div className="sw-panel-card" style={{ marginBottom: '1.25rem' }}>
            <div className="sw-panel-header">
              <div className="sw-panel-title-area">
                <h3>
                  <Clock size={18} className="text-amber" />
                  72-Hour Expiration Risk Horizon (Pre-Waste Prevention)
                </h3>
                <p>
                  Proactively detect batches nearing expiration so kitchen staff can feature them in daily specials before spoilage.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setShowAllAtRisk((prev) => !prev)}
              >
                {showAllAtRisk ? 'Collapse Batches' : `View Batches (${expiryHorizon.atRiskCount})`}
              </button>
            </div>

            {/* 4 Horizon Buckets */}
            <div className="sw-horizon-buckets">
              <div className="sw-horizon-card bucket-critical">
                <span className="sw-horizon-label" style={{ color: '#be123c' }}>
                  🔴 &lt; 24h Critical
                </span>
                <span className="sw-horizon-val" style={{ color: '#9f1239' }}>
                  {formatCurrency(expiryHorizon.criticalVal)}
                </span>
                <span className="sw-horizon-sub">
                  <strong>{expiryHorizon.critical.length}</strong> batches at imminent risk
                </span>
              </div>

              <div className="sw-horizon-card bucket-urgent">
                <span className="sw-horizon-label" style={{ color: '#b45309' }}>
                  🟠 24 – 48h Urgent
                </span>
                <span className="sw-horizon-val" style={{ color: '#92400e' }}>
                  {formatCurrency(expiryHorizon.urgentVal)}
                </span>
                <span className="sw-horizon-sub">
                  <strong>{expiryHorizon.urgent.length}</strong> batches expiring tomorrow
                </span>
              </div>

              <div className="sw-horizon-card bucket-watchlist">
                <span className="sw-horizon-label" style={{ color: '#6d28d9' }}>
                  🟡 48 – 72h Watchlist
                </span>
                <span className="sw-horizon-val" style={{ color: '#5b21b6' }}>
                  {formatCurrency(expiryHorizon.watchlistVal)}
                </span>
                <span className="sw-horizon-sub">
                  <strong>{expiryHorizon.watchlist.length}</strong> batches to prioritize
                </span>
              </div>

              <div className="sw-horizon-card bucket-stable">
                <span className="sw-horizon-label" style={{ color: '#047857' }}>
                  🟢 &gt; 72h Safe Stock
                </span>
                <span className="sw-horizon-val" style={{ color: '#065f46' }}>
                  {formatCurrency(expiryHorizon.stableValue)}
                </span>
                <span className="sw-horizon-sub">
                  <strong>{expiryHorizon.stableCount}</strong> batches stable
                </span>
              </div>
            </div>

            {/* Proactive Kitchen Recommendation Banner */}
            {expiryHorizon.atRiskCount > 0 && (
              <div className="sw-horizon-alert-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Sparkles size={18} style={{ color: '#ea580c' }} />
                  <span>
                    <strong>Chef Action Recommended:</strong> You have{' '}
                    <strong>{formatCurrency(expiryHorizon.totalAtRisk)}</strong> worth of inventory expiring within 72 hours.
                    Feature dishes using these ingredients in today's menu specials to prevent financial write-off.
                  </span>
                </div>
              </div>
            )}

            {/* Itemized At-Risk Batches List */}
            {showAllAtRisk && (
              <div style={{ marginTop: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f8fafc', padding: '0.6rem 0.85rem', fontWeight: 600, fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                  Batches Expiring in Next 72 Hours
                </div>
                {[...expiryHorizon.critical, ...expiryHorizon.urgent, ...expiryHorizon.watchlist].length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    No batches expiring in the next 72 hours. All inventory is safe!
                  </div>
                ) : (
                  [...expiryHorizon.critical, ...expiryHorizon.urgent, ...expiryHorizon.watchlist].map((item, idx) => (
                    <div className="sw-batch-risk-item" key={idx}>
                      <div>
                        <strong>{item.batch.ingredientName}</strong> ·{' '}
                        <span className="font-mono text-xs text-accent">{item.batch.batchNumber}</span>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Remaining: {formatQuantity(item.batch.quantity)} {item.batch.unit} · Unit Cost: {formatCurrency(item.batch.unitCost)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          className={`badge ${
                            item.hoursLeft <= 24 ? 'badge-rose' : item.hoursLeft <= 48 ? 'badge-amber' : 'badge-purple'
                          }`}
                        >
                          {item.hoursLeft} hrs left
                        </span>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e11d48', marginTop: '2px' }}>
                          At Risk: {formatCurrency(item.value)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── SECTION 2: KITCHEN OPERATIONS & LOGGING ─── */}
      {(activeTab === 'OPERATIONS' || activeTab === 'ALL') && (
        <>
          <div className="dashboard-two-column">
            {/* Record Sale Panel */}
            <section className="table-card dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h3>Record Sale</h3>
                  <p className="text-sm text-muted">Revenue and ingredient usage are calculated by the backend.</p>
                </div>
              </div>
              <form className="stack-form" onSubmit={submitSale}>
                <label>
                  Menu item
                  <select
                    value={saleMenuItemId}
                    onChange={(event) => setSaleMenuItemId(event.target.value)}
                    disabled={!canRecordSale}
                  >
                    <option value="">Select menu item</option>
                    {menuItems
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · ${item.sellingPrice.toFixed(2)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={saleQuantity}
                    onChange={(event) => setSaleQuantity(event.target.value)}
                    disabled={!canRecordSale}
                  />
                </label>
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={!canRecordSale || busy || !saleMenuItemId}
                >
                  <Plus size={16} /> Record sale
                </button>
                {!canRecordSale && <span className="text-xs text-rose">Your role cannot record sales.</span>}
              </form>
            </section>

            {/* Record Waste Panel */}
            <section className="table-card dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h3>Record Waste</h3>
                  <p className="text-sm text-muted">Select a live stock batch. Inventory is reduced once.</p>
                </div>
              </div>
              <form className="stack-form" onSubmit={submitWaste}>
                <label>
                  Stock batch
                  <select
                    value={wasteBatchId}
                    onChange={(event) => setWasteBatchId(event.target.value)}
                    disabled={!canRecordWaste}
                  >
                    <option value="">Select batch</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.ingredientName} · {batch.batchNumber} · {batch.quantity} {batch.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={batches.find((batch) => batch.id === wasteBatchId)?.quantity}
                    value={wasteQuantity}
                    onChange={(event) => setWasteQuantity(event.target.value)}
                    disabled={!canRecordWaste}
                  />
                </label>
                <label>
                  Reason
                  <select
                    value={wasteReason}
                    onChange={(event) => setWasteReason(event.target.value)}
                    disabled={!canRecordWaste}
                  >
                    <option value="Spoilage">Spoilage / Expired</option>
                    <option value="Prep Error">Prep Error / Over-portioning</option>
                    <option value="Handling Damage">Handling / Storage Damage</option>
                    <option value="Cook Line Error">Burnt / Cook Line Error</option>
                    <option value="Customer Return">Customer Return / Quality</option>
                    <option value="Other">Other Unspecified</option>
                  </select>
                </label>
                <button
                  className="btn-danger"
                  type="submit"
                  disabled={!canRecordWaste || busy || !wasteBatchId}
                >
                  <Trash2 size={16} /> Record waste
                </button>
                {!canRecordWaste && <span className="text-xs text-rose">Your role cannot record waste.</span>}
              </form>
            </section>
          </div>

          {/* Activity Feeds */}
          <div className="dashboard-two-column">
            <section className="table-card dashboard-panel">
              <div className="panel-heading">
                <h3>Recent Sales</h3>
                <span className="badge badge-emerald">{sales.length}</span>
              </div>
              <div className="dashboard-list">
                {sales.slice(0, 8).map((sale) => (
                  <div className="dashboard-list-row" key={sale.id}>
                    <div>
                      <strong>{sale.items.map((item) => `${item.menuItemName} ×${item.quantity}`).join(', ')}</strong>
                      <span className="text-xs text-muted">
                        {new Date(sale.saleDate).toLocaleString()} · {sale.recordedByName}
                      </span>
                    </div>
                    <strong className="text-emerald">${sale.totalAmount.toFixed(2)}</strong>
                  </div>
                ))}
                {sales.length === 0 && <p className="empty-state">No sales recorded yet.</p>}
              </div>
            </section>

            <section className="table-card dashboard-panel">
              <div className="panel-heading">
                <h3>Waste Review &amp; Audit</h3>
                <span className="badge badge-rose">{wasteRecords.length}</span>
              </div>
              <div className="dashboard-list">
                {wasteRecords.slice(0, 8).map((record) => {
                  const costVal = getRecordCost(record);
                  return (
                    <div className="dashboard-list-row" key={record.id}>
                      <div>
                        <strong>
                          {record.ingredientName} · {record.quantity}
                        </strong>
                        <div className="text-xs text-muted">
                          {record.reason} · {record.status} ·{' '}
                          <span style={{ color: '#e11d48', fontWeight: 600 }}>
                            -{formatCurrency(costVal)} loss
                          </span>
                        </div>
                      </div>
                      {record.status === 'RECORDED' && canConfirmWaste && (
                        <button
                          className="btn-table-action"
                          type="button"
                          onClick={() => void handleConfirmWaste(record.id)}
                          disabled={busy}
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  );
                })}
                {wasteRecords.length === 0 && <p className="empty-state">No waste records yet.</p>}
              </div>
            </section>
          </div>

          <section className="table-card dashboard-panel">
            <div className="panel-heading">
              <h3>Recipe Coverage</h3>
            </div>
            <div className="dashboard-list">
              {recipes.slice(0, 8).map((recipe) => (
                <div className="dashboard-list-row" key={recipe.id}>
                  <div>
                    <strong>{recipe.menuItemName}</strong>
                    <span className="text-xs text-muted">
                      v{recipe.version} ·{' '}
                      {recipe.ingredients
                        .map((ingredient) => `${ingredient.ingredientName} ${formatQuantity(ingredient.quantityRequired)}${ingredient.unit}`)
                        .join(', ')}
                    </span>
                  </div>
                  <span className={`badge ${recipe.isActive ? 'badge-emerald' : 'badge-default'}`}>
                    {recipe.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              ))}
              {recipes.length === 0 && <p className="empty-state">No recipes configured yet.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
