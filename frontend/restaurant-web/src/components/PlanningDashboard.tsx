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
  Brain,
  CloudRain,
  Sun,
  Cloud,
} from 'lucide-react';
import { api } from '../services/api';
import type { MlForecastItem, MlStatusResponse } from '../services/api';
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
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [mlStatus, setMlStatus] = useState<MlStatusResponse | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlForecastCount, setMlForecastCount] = useState(0);

  const fetchPlanningData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMlError(null);

      // 1. Fetch rule-based plans, risks, and weather forecast from backend
      const [forecastData, risksData, weatherData] = await Promise.all([
        api.getPlanningForecast(periodStart, periodEnd),
        api.getPlanningRisks(periodStart, periodEnd),
        api.getWeatherForecast().catch(() => null),
      ]);

      if (weatherData) {
        setWeather(weatherData);
      }

      // 2. Try to fetch ML predictions directly from Python service
      let mlCount = 0;
      try {
        const mlResp = await api.getMlForecast(7);
        if (mlResp?.status === 'SUCCESS' && mlResp.forecasts?.length > 0) {
          // Build lookup: ingredientId -> ML forecast item
          const mlMap = new Map<string, MlForecastItem>();
          for (const f of mlResp.forecasts) {
            mlMap.set(f.ingredientId, f);
          }

          // Merge ML into rule-based plans — override forecast values when ML available
          for (const plan of forecastData) {
            const ml = mlMap.get(plan.ingredientId);
            if (!ml) continue;

            const mlWeekly = ml.weeklyForecast;
            const mlDaily  = ml.dailyAverageDemand;
            const mlProjected = plan.currentStock - mlWeekly;
            const mlShortage  = Math.max(0, mlWeekly - plan.currentStock);
            const mlCoverage  = mlDaily > 0 ? Math.round(plan.currentStock / mlDaily * 10) / 10 : 999;
            const mlReorder   = mlProjected < plan.minimumStockLevel || plan.currentStock < plan.minimumStockLevel;
            let mlRisk = 'NORMAL';
            if (mlProjected < 0 || plan.currentStock < plan.minimumStockLevel) mlRisk = 'STOCK_RISK';
            else if (plan.maximumStockLevel > 0 && plan.currentStock > plan.maximumStockLevel) mlRisk = 'OVERSTOCK_RISK';
            else if (plan.minimumStockLevel > 0 && mlWeekly > plan.minimumStockLevel * 1.5) mlRisk = 'HIGH_DEMAND';

            let mlOrderQty = 0;
            if (mlReorder) {
              const target = plan.maximumStockLevel > 0 ? plan.maximumStockLevel : mlWeekly + plan.minimumStockLevel;
              mlOrderQty = Math.max(0, target - Math.max(0, mlProjected));
            }

            // Mutate in-place (plan objects are plain JSON, safe to mutate)
            if (ml.predictionSource === 'ML') {
              plan.weeklyForecast       = Math.round(mlWeekly * 100) / 100;
              plan.dailyAverageDemand   = Math.round(mlDaily * 100) / 100;
              plan.projectedStock       = Math.round(mlProjected * 100) / 100;
              plan.projectedShortage    = Math.round(mlShortage * 100) / 100;
              plan.stockCoverageDays    = mlCoverage;
              plan.reorderRequired      = mlReorder;
              plan.recommendedOrderQuantity = Math.round(mlOrderQty * 100) / 100;
              plan.recommendation       = mlReorder ? 'REORDER' : 'NO_REORDER';
              plan.riskStatus           = mlRisk;
              plan.predictionSource     = 'ML';
              plan.generatedBy          = 'ML_AI_ENRICHED';
              plan.modelType            = ml.modelType;
              plan.mae                  = ml.mae;
              plan.trainingRecords      = ml.trainingRecords;
              plan.confidenceScore      = ml.confidenceScore;
              plan.dailyPredictions     = ml.dailyPredictions;
              if (ml.weatherInfluence) {
                plan.weatherInfluence   = ml.weatherInfluence as any;
                plan.weatherAvailable   = true;
              }
              mlCount++;
            }
          }

          // Also update the risk summary counts based on merged plans
          if (risksData) {
            risksData.reorderRequiredCount = forecastData.filter(p => p.reorderRequired).length;
            risksData.stockRiskCount       = forecastData.filter(p => p.riskStatus === 'STOCK_RISK').length;
            risksData.highDemandCount      = forecastData.filter(p => p.riskStatus === 'HIGH_DEMAND').length;
            risksData.overstockRiskCount   = forecastData.filter(p => p.riskStatus === 'OVERSTOCK_RISK').length;
          }
        }

        // Load ML status
        const status = await api.getMlStatus();
        setMlStatus(status);
      } catch {
        setMlError('ML service offline — showing rule-based forecasts.');
      }

      setMlForecastCount(mlCount);
      setPlans(forecastData);
      setRiskSummary(risksData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch demand planning data.');
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  const handleRetrain = async () => {
    setMlLoading(true);
    setMlError(null);
    try {
      await api.triggerMlTraining(true);
      await fetchPlanningData();
    } catch {
      setMlError('Failed to retrain ML model.');
    } finally {
      setMlLoading(false);
    }
  };

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

  const formatRainProb = (val: number | undefined | null) => {
    if (val == null) return 0;
    return val > 1 ? Math.round(val) : Math.round(val * 100);
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
                  Weather-aware ML demand forecasting with stock risk analysis and replenishment guidance.
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-3"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '1.25rem',
            }}
          >
            {/* ML Status pill */}
            {mlStatus && (
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: mlStatus.model_loaded && !mlStatus.is_stale
                    ? 'rgba(139, 92, 246, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                  color: mlStatus.model_loaded && !mlStatus.is_stale
                    ? 'var(--accent)'
                    : '#f59e0b',
                  border: `1px solid ${mlStatus.model_loaded && !mlStatus.is_stale ? 'rgba(139,92,246,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                <Brain size={12} />
                {mlStatus.model_loaded && !mlStatus.is_stale
                  ? `ML Active · ${mlForecastCount} predictions`
                  : mlStatus.model_loaded
                  ? 'ML Stale'
                  : 'ML Not Trained'}
                {mlStatus.mae != null && (
                  <span style={{ opacity: 0.75 }}>· MAE {Number(mlStatus.mae).toFixed(3)}</span>
                )}
              </div>
            )}
            {mlError && (
              <span className="text-xs" style={{ color: '#f59e0b' }}>{mlError}</span>
            )}

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

            {/* Retrain ML model */}
            <button
              type="button"
              onClick={handleRetrain}
              disabled={mlLoading || loading}
              className="btn-action flex items-center gap-2"
              style={{
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139,92,246,0.35)',
                color: 'var(--accent)',
                fontSize: '0.78rem',
                padding: '0.35rem 0.75rem',
              }}
              title="Re-train the Random Forest model on latest 60 days of data"
            >
              <Brain size={13} className={mlLoading ? 'animate-spin' : ''} />
              <span>{mlLoading ? 'Training…' : 'Retrain AI'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                fetchPlanningData();
                if (onSuccess) onSuccess('Refreshed demand forecast & risk calculations.');
              }}
              disabled={loading}
              className="btn-primary"
              style={{ minHeight: '40px', padding: '0.55rem 1rem' }}
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

      {/* Weather Forecast & Environmental Recommendation Grid */}
      {weather?.current && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: Live Weather Conditions & Multi-day Forecast */}
          <div
            className="lg:col-span-2 glass-card p-4 rounded-xl flex flex-col justify-between gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(139, 92, 246, 0.08))',
              border: '1px solid rgba(6, 182, 212, 0.25)',
            }}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{
                    width: 46,
                    height: 46,
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: '#06b6d4',
                  }}
                >
                  {weather.current.condition?.toLowerCase().includes('rain') ? (
                    <CloudRain size={26} />
                  ) : weather.current.condition?.toLowerCase().includes('cloud') ? (
                    <Cloud size={26} />
                  ) : (
                    <Sun size={26} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-main">
                      {weather.city || 'Local Area'} Weather: {weather.current.condition} ({weather.current.temperature}°C)
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        background: 'rgba(139, 92, 246, 0.18)',
                        color: 'var(--accent)',
                        fontSize: '0.70rem',
                        border: '1px solid rgba(139, 92, 246, 0.35)',
                      }}
                    >
                      ⚡ AI Weather-Aware
                    </span>
                  </div>
                  <p className="text-muted text-xs mt-0.5">
                    Rain Probability: <strong className="text-main">{formatRainProb(weather.current.rainProbability)}%</strong> · Humidity: <strong className="text-main">{weather.current.humidity}%</strong> · Wind: <strong className="text-main">{weather.current.windSpeed} m/s</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* 5-day forecast chips */}
            {weather.forecast && weather.forecast.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-border/40">
                <span className="text-xs text-muted font-medium mr-1 flex-shrink-0">5-Day Outlook:</span>
                {weather.forecast.slice(0, 5).map((f: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-shrink-0"
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: '0.72rem',
                    }}
                  >
                    <span className="text-muted font-medium">{f.dayOfWeek?.slice(0, 3) || `Day ${idx + 1}`}</span>
                    <span className="font-bold text-main">{Math.round(f.tempMax || f.tempMin || 20)}°C</span>
                    <span style={{ color: '#06b6d4' }}>
                      {f.condition?.toLowerCase().includes('rain') ? '🌧️' : '☀️'}
                    </span>
                    <span className="text-muted text-xs" style={{ fontSize: '0.65rem' }}>
                      {formatRainProb(f.rainProbability)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Col: Prominent Weather & Planning Recommendation Box */}
          <div
            className="glass-card p-4 rounded-xl flex flex-col justify-between"
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(6, 182, 212, 0.09))',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              boxShadow: '0 4px 20px -4px rgba(139, 92, 246, 0.15)',
            }}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent" style={{ color: 'var(--accent)', letterSpacing: '0.05em' }}>
                  💡 AI Weather Recommendation
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded font-semibold"
                  style={{
                    background: 'rgba(6, 182, 212, 0.18)',
                    color: '#06b6d4',
                    fontSize: '0.70rem',
                  }}
                >
                  {weather.current.condition} Impact
                </span>
              </div>
              <p
                className="text-main font-semibold leading-relaxed"
                style={{
                  fontSize: '0.96rem',
                  margin: '0.35rem 0',
                  color: 'var(--text-main, #f8fafc)',
                  lineHeight: 1.5,
                }}
              >
                {weather.overallRecommendation || weather.current.demandImpact?.recommendationNote || weather.current.description || 'Weather is consistent with seasonal baselines. Maintain planned ingredient stock.'}
              </p>
            </div>

            <div className="text-xs text-muted mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
              <span>Demand Multipliers Active</span>
              <span className="font-semibold text-accent" style={{ color: 'var(--accent)' }}>Applied to ML Projections</span>
            </div>
          </div>
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
                    {/* ML vs Rule-Based badge */}
                    {plan.predictionSource === 'ML' ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <div className="flex items-center gap-1">
                          <Brain size={10} style={{ color: 'var(--accent)' }} />
                          <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>ML</span>
                          {plan.mae != null && (
                            <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>MAE: {plan.mae}</span>
                          )}
                        </div>
                        {/* Weather Influence Pill */}
                        {plan.weatherInfluence && (
                          <div
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs cursor-help"
                            style={{
                              fontSize: '0.60rem',
                              fontWeight: 600,
                              background:
                                plan.weatherInfluence.impact === 'INCREASED'
                                  ? 'rgba(6, 182, 212, 0.15)'
                                  : plan.weatherInfluence.impact === 'DECREASED'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(255, 255, 255, 0.05)',
                              color:
                                plan.weatherInfluence.impact === 'INCREASED'
                                  ? '#06b6d4'
                                  : plan.weatherInfluence.impact === 'DECREASED'
                                  ? '#f59e0b'
                                  : 'var(--text-muted)',
                              border: `1px solid ${
                                plan.weatherInfluence.impact === 'INCREASED'
                                  ? 'rgba(6, 182, 212, 0.3)'
                                  : plan.weatherInfluence.impact === 'DECREASED'
                                  ? 'rgba(245, 158, 11, 0.3)'
                                  : 'rgba(255, 255, 255, 0.1)'
                              }`,
                            }}
                            title={plan.weatherInfluence.explanation}
                          >
                            {plan.weatherInfluence.impact === 'INCREASED' ? (
                              <CloudRain size={9} />
                            ) : plan.weatherInfluence.impact === 'DECREASED' ? (
                              <Sun size={9} />
                            ) : (
                              <Cloud size={9} />
                            )}
                            <span>
                              {plan.weatherInfluence.impact === 'INCREASED'
                                ? 'Weather Surge'
                                : plan.weatherInfluence.impact === 'DECREASED'
                                ? 'Weather Drop'
                                : 'Weather Neutral'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Rule-Based
                      </div>
                    )}
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
