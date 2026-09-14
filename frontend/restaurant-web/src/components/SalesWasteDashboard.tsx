import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  PackageOpen,
  Plus,
  RefreshCw,
  Trash2,
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

  const canRecordSale = user?.role === 'RESTAURANT_MANAGER';
  const canRecordWaste = user?.role === 'SALES_KITCHEN_STAFF';
  const canConfirmWaste = ['INVENTORY_MANAGER', 'RESTAURANT_MANAGER'].includes(user?.role ?? '');

  const batches = useMemo(
    () => inventory.flatMap((item) => item.batches.map((batch) => ({
      ...batch,
      ingredientName: item.ingredientName,
      unit: item.unit,
    }))).filter((batch) => batch.quantity > 0),
    [inventory],
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

  return (
    <div className="view-container">
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Sales, Consumption & Waste</h2>
          <p>Record sales, monitor recipe-driven consumption, and maintain an auditable waste trail without leaving the operations dashboard.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadData()} disabled={loading || busy}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="alert-error"><AlertCircle size={18} />{error}</div>}
      {notice && <div className="alert-success"><CheckCircle2 size={18} />{notice}</div>}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon-wrapper bg-emerald-glow"><DollarSign className="text-emerald" /></div><div className="stat-content"><span className="stat-label">Revenue</span><span className="stat-value">${(salesSummary?.totalRevenue ?? 0).toFixed(2)}</span><span className="stat-subtext">{salesSummary?.totalSales ?? 0} completed sales</span></div></div>
        <div className="stat-card"><div className="stat-icon-wrapper bg-blue-glow"><ClipboardList className="text-blue" /></div><div className="stat-content"><span className="stat-label">Items Sold</span><span className="stat-value">{salesSummary?.totalItemsSold ?? 0}</span><span className="stat-subtext">Server-calculated quantities</span></div></div>
        <div className="stat-card"><div className="stat-icon-wrapper bg-rose-glow"><Trash2 className="text-rose" /></div><div className="stat-content"><span className="stat-label">Waste</span><span className="stat-value">{wasteSummary?.totalWasteQuantity ?? 0}</span><span className="stat-subtext">{wasteSummary?.totalWasteRecords ?? 0} records</span></div></div>
        <div className="stat-card"><div className="stat-icon-wrapper bg-purple-glow"><PackageOpen className="text-accent" /></div><div className="stat-content"><span className="stat-label">Active Recipes</span><span className="stat-value">{recipes.filter((recipe) => recipe.isActive).length}</span><span className="stat-subtext">{menuItems.filter((item) => item.isActive).length} active menu items</span></div></div>
      </div>

      <div className="dashboard-two-column">
        <section className="table-card dashboard-panel">
          <div className="panel-heading"><div><h3>Record Sale</h3><p className="text-sm text-muted">Revenue and ingredient usage are calculated by the backend.</p></div></div>
          <form className="stack-form" onSubmit={submitSale}>
            <label>Menu item<select value={saleMenuItemId} onChange={(event) => setSaleMenuItemId(event.target.value)} disabled={!canRecordSale}><option value="">Select menu item</option>{menuItems.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · ${item.sellingPrice.toFixed(2)}</option>)}</select></label>
            <label>Quantity<input type="number" min="1" step="1" value={saleQuantity} onChange={(event) => setSaleQuantity(event.target.value)} disabled={!canRecordSale} /></label>
            <button className="btn-primary" type="submit" disabled={!canRecordSale || busy || !saleMenuItemId}><Plus size={16} />Record sale</button>
            {!canRecordSale && <span className="text-xs text-rose">Your role cannot record sales.</span>}
          </form>
        </section>

        <section className="table-card dashboard-panel">
          <div className="panel-heading"><div><h3>Record Waste</h3><p className="text-sm text-muted">Select a live stock batch. Inventory is reduced once.</p></div></div>
          <form className="stack-form" onSubmit={submitWaste}>
            <label>Stock batch<select value={wasteBatchId} onChange={(event) => setWasteBatchId(event.target.value)} disabled={!canRecordWaste}><option value="">Select batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.ingredientName} · {batch.batchNumber} · {batch.quantity} {batch.unit}</option>)}</select></label>
            <label>Quantity<input type="number" min="0.001" step="0.001" max={batches.find((batch) => batch.id === wasteBatchId)?.quantity} value={wasteQuantity} onChange={(event) => setWasteQuantity(event.target.value)} disabled={!canRecordWaste} /></label>
            <label>Reason<input value={wasteReason} onChange={(event) => setWasteReason(event.target.value)} disabled={!canRecordWaste} maxLength={100} /></label>
            <button className="btn-danger" type="submit" disabled={!canRecordWaste || busy || !wasteBatchId}><Trash2 size={16} />Record waste</button>
            {!canRecordWaste && <span className="text-xs text-rose">Your role cannot record waste.</span>}
          </form>
        </section>

      </div>

      <div className="dashboard-two-column">
        <section className="table-card dashboard-panel">
          <div className="panel-heading"><h3>Recent Sales</h3><span className="badge badge-emerald">{sales.length}</span></div>
          <div className="dashboard-list">{sales.slice(0, 8).map((sale) => <div className="dashboard-list-row" key={sale.id}><div><strong>{sale.items.map((item) => `${item.menuItemName} ×${item.quantity}`).join(', ')}</strong><span className="text-xs text-muted">{new Date(sale.saleDate).toLocaleString()} · {sale.recordedByName}</span></div><strong className="text-emerald">${sale.totalAmount.toFixed(2)}</strong></div>)}{sales.length === 0 && <p className="empty-state">No sales recorded yet.</p>}</div>
        </section>

        <section className="table-card dashboard-panel">
          <div className="panel-heading"><h3>Waste Review</h3><span className="badge badge-rose">{wasteRecords.length}</span></div>
          <div className="dashboard-list">{wasteRecords.slice(0, 8).map((record) => <div className="dashboard-list-row" key={record.id}><div><strong>{record.ingredientName} · {record.quantity}</strong><span className="text-xs text-muted">{record.reason} · {record.status}</span></div>{record.status === 'RECORDED' && canConfirmWaste && <button className="btn-table-action" type="button" onClick={() => void handleConfirmWaste(record.id)} disabled={busy}>Confirm</button>}</div>)}{wasteRecords.length === 0 && <p className="empty-state">No waste records yet.</p>}</div>
        </section>
      </div>

      <section className="table-card dashboard-panel">
        <div className="panel-heading"><h3>Recipe Coverage</h3></div>
        <div className="dashboard-list">{recipes.slice(0, 8).map((recipe) => <div className="dashboard-list-row" key={recipe.id}><div><strong>{recipe.menuItemName}</strong><span className="text-xs text-muted">v{recipe.version} · {recipe.ingredients.map((ingredient) => `${ingredient.ingredientName} ${formatQuantity(ingredient.quantityRequired)}${ingredient.unit}`).join(', ')}</span></div><span className={`badge ${recipe.isActive ? 'badge-emerald' : 'badge-default'}`}>{recipe.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>)}{recipes.length === 0 && <p className="empty-state">No recipes configured yet.</p>}</div>
      </section>
    </div>
  );
};
