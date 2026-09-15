import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Package,
  Calendar,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  ShoppingCart,
  ShieldAlert,
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
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 14);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  const defaultDates = getDefaultDates();
  const [periodStart, setPeriodStart] = useState<string>(defaultDates.start);
  const [periodEnd, setPeriodEnd] = useState<string>(defaultDates.end);
  const [plans, setPlans] = useState<DemandPlanResponse[]>([]);
  const [riskSummary, setRiskSummary] = useState<PlanningRiskSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

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
      {/* Top Header Card */}
      <div className="table-card p-6" style={{ padding: '1.25rem 1.5rem' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="stat-icon-wrapper bg-purple-glow" style={{ width: 38, height: 38 }}>
                <BarChart3 size={20} className="text-purple" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-main" style={{ fontSize: '1.25rem', margin: 0 }}>
                  Demand &amp; Inventory Planning
                </h1>
                <p className="text-muted text-xs" style={{ margin: '0.2rem 0 0 0' }}>
                  Rule-based 7-day demand forecasting, stock risk assessment, and replenishment recommendations.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="input-with-icon px-3 py-1.5 rounded-lg border border-border bg-input flex items-center gap-2">
              <Calendar size={14} className="text-secondary" />
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="bg-transparent text-xs text-main border-none outline-none cursor-pointer"
              />
              <span className="text-muted text-xs">to</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="bg-transparent text-xs text-main border-none outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                fetchPlanningData();
                if (onSuccess) onSuccess('Refreshed demand forecast & risk calculations.');
              }}
              disabled={loading}
              className="btn-action btn-action-primary flex items-center gap-2"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Recalculate</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 flex items-center gap-3 border-rose-500/30 text-rose-400" style={{ background: 'rgba(244, 63, 94, 0.08)' }}>
          <AlertCircle size={18} className="flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* KPI Stat Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-purple-glow">
            <Package size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Ingredients</span>
            <span className="stat-value">{riskSummary?.totalIngredients ?? plans.length}</span>
            <span className="stat-subtext">Catalog items analyzed</span>
          </div>
        </div>

        <div className={`stat-card ${reorderCount > 0 ? 'stat-danger' : ''}`}>
          <div className="stat-icon-wrapper bg-rose-glow">
            <ShoppingCart size={24} className="text-rose" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Reorder Required</span>
            <span className="stat-value">{reorderCount}</span>
            <span className="stat-subtext">Below minimum / safe stock</span>
          </div>
        </div>

        <div className={`stat-card ${stockRiskCount > 0 ? 'stat-warning' : ''}`}>
          <div className="stat-icon-wrapper bg-amber-glow">
            <ShieldAlert size={24} className="text-amber" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Stock Out Risk</span>
            <span className="stat-value">{stockRiskCount}</span>
            <span className="stat-subtext">Projected shortage this week</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper bg-blue-glow">
            <TrendingUp size={24} className="text-blue" />
          </div>
          <div className="stat-content">
            <span className="stat-label">High Demand Items</span>
            <span className="stat-value">{highDemandCount}</span>
            <span className="stat-subtext">Surpassing safety thresholds</span>
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="controls-bar">
        <div className="search-group">
          <div className="input-with-icon search-input">
            <Search size={18} className="input-icon" />
            <input
              type="text"
              placeholder="Search by ingredient name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={`btn-filter ${statusFilter === 'REORDER' ? 'active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'REORDER' ? 'ALL' : 'REORDER')}
          >
            <Filter size={16} />
            <span>Reorder Required ({reorderCount})</span>
          </button>
        </div>

        <div className="quick-actions">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="btn-filter"
            style={{ cursor: 'pointer', paddingRight: '1rem' }}
          >
            <option value="ALL">All Statuses ({plans.length})</option>
            <option value="REORDER">Reorder Required</option>
            <option value="STOCK_RISK">Stock Out Risk</option>
            <option value="HIGH_DEMAND">High Demand</option>
            <option value="OVERSTOCK_RISK">Overstock Risk</option>
          </select>
        </div>
      </div>

      {/* Custom Data Table Container */}
      <div className="table-card">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Ingredient / SKU</th>
              <th>Current Stock</th>
              <th>7-Day Demand Forecast</th>
              <th>Projected Stock</th>
              <th>Coverage</th>
              <th>Recommendation</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw size={18} className="animate-spin text-accent" />
                    <span>Calculating ingredient demand & inventory position...</span>
                  </div>
                </td>
              </tr>
            ) : filteredPlans.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted">
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
                    <div className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>
                      Min: {plan.minimumStockLevel} | Max: {plan.maximumStockLevel}
                    </div>
                  </td>
                  <td>
                    <div className="font-semibold text-accent" style={{ color: 'var(--accent)' }}>
                      {plan.weeklyForecast} {plan.unit}
                    </div>
                    <div className="text-xs text-muted" style={{ fontSize: '0.7rem' }}>
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
                      <div className="text-xs text-rose font-medium" style={{ fontSize: '0.7rem' }}>
                        Shortage: {plan.projectedShortage} {plan.unit}
                      </div>
                    )}
                  </td>
                  <td className="text-secondary text-sm">
                    {plan.stockCoverageDays > 300 ? '30+ Days' : `${plan.stockCoverageDays} Days`}
                  </td>
                  <td>
                    {plan.reorderRequired ? (
                      <div>
                        <span className="badge badge-rose">REORDER</span>
                        <div className="text-xs font-semibold text-accent mt-0.5" style={{ fontSize: '0.72rem' }}>
                          Order +{plan.recommendedOrderQuantity} {plan.unit}
                        </div>
                      </div>
                    ) : (
                      <span className="badge badge-purple" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                        NO REORDER
                      </span>
                    )}
                  </td>
                  <td>{renderRiskBadge(plan.riskStatus, plan.reorderRequired)}</td>
                  <td className="text-xs text-muted max-w-xs leading-relaxed" style={{ fontSize: '0.75rem' }}>
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
