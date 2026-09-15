import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Package,
  Calendar,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
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

  const getRiskBadge = (riskStatus: string, reorderRequired: boolean) => {
    if (riskStatus === 'STOCK_RISK' || reorderRequired) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Stock Risk
        </span>
      );
    }
    if (riskStatus === 'HIGH_DEMAND') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <TrendingUp className="w-3.5 h-3.5" />
          High Demand
        </span>
      );
    }
    if (riskStatus === 'OVERSTOCK_RISK') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Package className="w-3.5 h-3.5" />
          Overstock Risk
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle className="w-3.5 h-3.5" />
        Normal
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-indigo-400" />
            Component 4 — Demand & Inventory Planning
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Automated rule-based 7-day demand forecasting, stock risk assessment, and procurement recommendations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => {
              fetchPlanningData();
              if (onSuccess) onSuccess('Refreshed demand forecast data.');
            }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Analytics KPI Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Tracked Ingredients</p>
            <p className="text-2xl font-bold text-white mt-1">
              {riskSummary?.totalIngredients ?? plans.length}
            </p>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Reorder Required</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {riskSummary?.reorderRequiredCount ?? plans.filter((p) => p.reorderRequired).length}
            </p>
          </div>
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">High Demand Items</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {riskSummary?.highDemandCount ?? plans.filter((p) => p.riskStatus === 'HIGH_DEMAND').length}
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Stock Risk Warning</p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {riskSummary?.stockRiskCount ?? plans.filter((p) => p.riskStatus === 'STOCK_RISK').length}
            </p>
          </div>
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search ingredient or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 text-slate-200 text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950/60 border border-slate-800 text-slate-200 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Items ({plans.length})</option>
            <option value="REORDER">Reorder Required</option>
            <option value="STOCK_RISK">Stock Out Risk</option>
            <option value="HIGH_DEMAND">High Demand</option>
            <option value="OVERSTOCK_RISK">Overstock Risk</option>
          </select>
        </div>
      </div>

      {/* Demand Forecast & Replenishment Table */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">Ingredient / SKU</th>
                <th className="py-3.5 px-4">Current Stock</th>
                <th className="py-3.5 px-4">7-Day Demand Forecast</th>
                <th className="py-3.5 px-4">Projected Stock</th>
                <th className="py-3.5 px-4">Stock Coverage</th>
                <th className="py-3.5 px-4">Recommendation</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                    Calculating ingredient demand forecasts & inventory position...
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No ingredient demand records match your current filter.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-4 px-4 font-medium text-white">
                      <div>{plan.ingredientName}</div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5">{plan.sku}</div>
                    </td>
                    <td className="py-4 px-4 text-slate-200">
                      <span className="font-semibold text-white">
                        {plan.currentStock} {plan.unit}
                      </span>
                      <div className="text-xs text-slate-400">
                        Min: {plan.minimumStockLevel} | Max: {plan.maximumStockLevel}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-indigo-300 font-semibold">
                      {plan.weeklyForecast} {plan.unit}
                      <div className="text-xs text-slate-400">
                        (~{plan.dailyAverageDemand} {plan.unit}/day)
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`font-semibold ${
                          plan.projectedStock < 0
                            ? 'text-red-400'
                            : plan.projectedStock < plan.minimumStockLevel
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {plan.projectedStock} {plan.unit}
                      </span>
                      {plan.projectedShortage > 0 && (
                        <div className="text-xs text-red-400">Shortage: {plan.projectedShortage} {plan.unit}</div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-slate-300">
                      {plan.stockCoverageDays > 300
                        ? '30+ Days'
                        : `${plan.stockCoverageDays} Days`}
                    </td>
                    <td className="py-4 px-4">
                      {plan.reorderRequired ? (
                        <div>
                          <span className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
                            REORDER
                          </span>
                          <div className="text-xs font-semibold text-indigo-300 mt-1">
                            Order +{plan.recommendedOrderQuantity} {plan.unit}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded">
                          NO REORDER
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {getRiskBadge(plan.riskStatus, plan.reorderRequired)}
                    </td>
                    <td className="py-4 px-4 text-xs text-slate-400 max-w-xs leading-relaxed">
                      {plan.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
