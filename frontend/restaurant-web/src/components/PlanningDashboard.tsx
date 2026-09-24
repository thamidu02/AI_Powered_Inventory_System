import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Package,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ShoppingCart,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  DemandPlanResponse,
  PlanningRiskSummaryResponse,
} from '../types';

interface PlanningDashboardProps {
  onSuccess?: (msg: string) => void;
}

export const PlanningDashboard: React.FC<PlanningDashboardProps> = ({ onSuccess }) => {
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(7);

  const calculateDates = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const [periodStart, setPeriodStart] = useState<string>(() => calculateDates(7).start);
  const [periodEnd, setPeriodEnd] = useState<string>(() => calculateDates(7).end);

  const [plans, setPlans] = useState<DemandPlanResponse[]>([]);
  const [riskSummary, setRiskSummary] = useState<PlanningRiskSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const handlePeriodChange = (days: 7 | 14 | 30) => {
    setPeriodDays(days);
    const dates = calculateDates(days);
    setPeriodStart(dates.start);
    setPeriodEnd(dates.end);
  };

  const fetchPlanningData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [forecastData, risksData] = await Promise.all([
        api.getPlanningForecast(periodStart, periodEnd),
        api.getPlanningRisks(periodStart, periodEnd),
      ]);
      setPlans(forecastData);
      setRiskSummary(risksData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch demand planning data.');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    fetchPlanningData();
  }, [fetchPlanningData]);

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      const matchesSearch =
        plan.ingredientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.sku.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'REORDER') return plan.reorderRequired;
      if (statusFilter === 'STOCK_RISK') return plan.riskStatus === 'STOCK_RISK';
      if (statusFilter === 'HIGH_DEMAND') return plan.riskStatus === 'HIGH_DEMAND';
      if (statusFilter === 'OVERSTOCK_RISK') return plan.riskStatus === 'OVERSTOCK_RISK';
      return true;
    });
  }, [plans, searchQuery, statusFilter]);

  // Suggested purchases highlight list (items requiring reorder)
  const suggestedPurchases = useMemo(() => {
    return plans.filter((p) => p.reorderRequired || p.riskStatus === 'STOCK_RISK');
  }, [plans]);

  const renderRiskBadge = (riskStatus: string, reorderRequired: boolean) => {
    if (riskStatus === 'STOCK_RISK' || reorderRequired) {
      return (
        <span className="badge badge-rose inline-flex items-center gap-1">
          <AlertTriangle size={12} />
          Stock Risk
        </span>
      );
    }
    if (riskStatus === 'HIGH_DEMAND') {
      return (
        <span className="badge badge-amber inline-flex items-center gap-1">
          <TrendingUp size={12} />
          High Demand
        </span>
      );
    }
    if (riskStatus === 'OVERSTOCK_RISK') {
      return (
        <span className="badge badge-blue inline-flex items-center gap-1">
          <Package size={12} />
          Overstock Risk
        </span>
      );
    }
    return (
      <span className="badge badge-emerald inline-flex items-center gap-1">
        <CheckCircle2 size={12} />
        Normal
      </span>
    );
  };

  const reorderCount = riskSummary?.reorderRequiredCount ?? plans.filter((p) => p.reorderRequired).length;
  const stockRiskCount = riskSummary?.stockRiskCount ?? plans.filter((p) => p.riskStatus === 'STOCK_RISK').length;
  const highDemandCount = riskSummary?.highDemandCount ?? plans.filter((p) => p.riskStatus === 'HIGH_DEMAND').length;

  return (
    <div className="view-container">
      {/* ─── Hero Overview ──────────────────────────────────────── */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Demand Planning</h2>
          <p>Plan upcoming ingredient purchases using recipe consumption trends and live inventory levels.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Period selector */}
          <div className="menu-category-tabs" style={{ margin: 0 }}>
            <button
              type="button"
              className={`menu-cat-btn ${periodDays === 7 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(7)}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`menu-cat-btn ${periodDays === 14 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(14)}
            >
              14 Days
            </button>
            <button
              type="button"
              className={`menu-cat-btn ${periodDays === 30 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(30)}
            >
              30 Days
            </button>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              fetchPlanningData();
              if (onSuccess) onSuccess('Refreshed demand forecast calculations.');
            }}
            disabled={loading}
            title="Recalculate demand forecast"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ─── High-Level Forecasting KPI Row ─────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-purple-glow">
            <Package size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Ingredients Analyzed</span>
            <span className="stat-value">{riskSummary?.totalIngredients ?? plans.length}</span>
            <span className="stat-subtext">Active menu recipes</span>
          </div>
        </div>

        <div className={`stat-card ${reorderCount > 0 ? 'stat-card-highlight-amber' : ''}`}>
          <div className="stat-icon-wrapper bg-rose-glow">
            <ShoppingCart size={22} className="text-rose" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Reorder Needed</span>
            <span className="stat-value text-rose">{reorderCount}</span>
            <span className="stat-subtext">Below safety threshold</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-amber-glow">
            <ShieldAlert size={22} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Stock Out Risk</span>
            <span className="stat-value text-amber">{stockRiskCount}</span>
            <span className="stat-subtext">Projected deficit in window</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <TrendingUp size={22} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">High Demand Items</span>
            <span className="stat-value text-blue">{highDemandCount}</span>
            <span className="stat-subtext">Strong sales consumption</span>
          </div>
        </div>
      </div>

      {/* ─── Smart Suggestions & Suggested Purchases Panel ──────── */}
      {suggestedPurchases.length > 0 && (
        <div className="suggested-purchases-panel mt-6">
          <div className="panel-heading mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-accent" />
              <h3 className="section-title" style={{ margin: 0 }}>
                Suggested Purchases ({suggestedPurchases.length})
              </h3>
            </div>
            <span className="text-xs text-muted">
              Calculated from {periodDays}-day sales velocity and buffer requirements
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestedPurchases.slice(0, 6).map((item) => (
              <div className="suggested-purchase-card" key={item.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <strong className="text-base text-primary">{item.ingredientName}</strong>
                    <div className="text-xs font-mono text-muted">SKU: {item.sku}</div>
                  </div>
                  <span className="badge badge-rose font-bold">
                    +{item.recommendedOrderQuantity} {item.unit}
                  </span>
                </div>

                <div className="suggested-metrics-grid">
                  <div className="suggested-metric">
                    <span className="text-muted text-xs">Current Stock</span>
                    <strong>
                      {item.currentStock} {item.unit}
                    </strong>
                  </div>
                  <div className="suggested-metric">
                    <span className="text-muted text-xs">Expected Demand</span>
                    <strong className="text-accent">
                      {item.weeklyForecast} {item.unit}
                    </strong>
                  </div>
                </div>

                <p className="suggested-reason-text">
                  <Info size={12} className="inline mr-1 text-muted" />
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filter & Search Bar ─────────────────────────────────── */}
      <div className="controls-bar mt-6">
        <div className="search-group">
          <div className="input-with-icon search-input">
            <Search size={16} className="input-icon" />
            <input
              type="text"
              placeholder="Search ingredient or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`btn-filter ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All Items ({plans.length})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'REORDER' ? 'active' : ''}`}
            onClick={() => setStatusFilter('REORDER')}
          >
            Reorder Needed ({reorderCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'STOCK_RISK' ? 'active' : ''}`}
            onClick={() => setStatusFilter('STOCK_RISK')}
          >
            Stock Risk ({stockRiskCount})
          </button>
          <button
            type="button"
            className={`btn-filter ${statusFilter === 'HIGH_DEMAND' ? 'active' : ''}`}
            onClick={() => setStatusFilter('HIGH_DEMAND')}
          >
            High Demand ({highDemandCount})
          </button>
        </div>
      </div>

      {/* ─── Detailed Forecast Table ─────────────────────────────── */}
      <div className="table-card">
        <div className="panel-heading p-4 border-b border-border">
          <div>
            <h3 className="section-title">Ingredient Demand Position</h3>
            <p className="text-xs text-muted">
              Live comparison of current pantry stock against {periodDays}-day forecast and safety thresholds.
            </p>
          </div>
          <span className="badge badge-emerald">{filteredPlans.length} records</span>
        </div>

        <table className="custom-table">
          <thead>
            <tr>
              <th>Ingredient &amp; SKU</th>
              <th>Current Stock</th>
              <th>Expected Demand</th>
              <th>Projected Balance</th>
              <th>Pantry Coverage</th>
              <th>Recommendation</th>
              <th>Status</th>
              <th>Planning Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-muted">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={18} className="animate-spin text-accent" />
                    <span>Calculating recipe velocity &amp; inventory positions...</span>
                  </div>
                </td>
              </tr>
            ) : filteredPlans.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-muted">
                  No ingredient demand records match your current criteria.
                </td>
              </tr>
            ) : (
              filteredPlans.map((plan) => (
                <tr key={plan.id} className="row-clickable">
                  <td>
                    <div className="ingredient-title">{plan.ingredientName}</div>
                    <div className="ingredient-sku">{plan.sku}</div>
                  </td>

                  <td>
                    <div className="stock-number">
                      {plan.currentStock} <span className="text-xs text-muted">{plan.unit}</span>
                    </div>
                    <div className="text-xs text-muted">
                      Buffer: {plan.minimumStockLevel} {plan.unit}
                    </div>
                  </td>

                  <td>
                    <div className="font-semibold text-primary">
                      {plan.weeklyForecast} {plan.unit}
                    </div>
                    <div className="text-xs text-muted">
                      (~{plan.dailyAverageDemand} {plan.unit}/day)
                    </div>
                  </td>

                  <td>
                    <div
                      className={`font-semibold ${
                        plan.projectedStock < 0
                          ? 'text-rose'
                          : plan.projectedStock < plan.minimumStockLevel
                          ? 'text-amber'
                          : 'text-emerald'
                      }`}
                    >
                      {plan.projectedStock} {plan.unit}
                    </div>
                    {plan.projectedShortage > 0 && (
                      <div className="text-xs text-rose font-medium">
                        Shortage: {plan.projectedShortage} {plan.unit}
                      </div>
                    )}
                  </td>

                  <td>
                    <span className="badge badge-default">
                      {plan.stockCoverageDays > 300 ? '30+ Days' : `${plan.stockCoverageDays} Days`}
                    </span>
                  </td>

                  <td>
                    {plan.reorderRequired ? (
                      <div>
                        <span className="badge badge-rose">REORDER</span>
                        <div className="text-xs font-bold text-primary mt-0.5">
                          Order +{plan.recommendedOrderQuantity} {plan.unit}
                        </div>
                      </div>
                    ) : (
                      <span className="badge badge-default text-muted">
                        Adequate
                      </span>
                    )}
                  </td>

                  <td>{renderRiskBadge(plan.riskStatus, plan.reorderRequired)}</td>

                  <td className="text-xs text-secondary max-w-xs leading-relaxed">
                    {plan.reason}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
