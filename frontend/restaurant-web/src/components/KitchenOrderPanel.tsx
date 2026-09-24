import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChefHat,
  Minus,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  X,
  Search,
  Receipt,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type { MenuItemResponse, CreateSaleRequest, SalesSummaryResponse } from '../types';
import { getFoodImage, getFoodCategory } from '../utils/foodImages';

interface CartItem {
  menuItem: MenuItemResponse;
  quantity: number;
}

const CATEGORY_TABS = ['All Dishes', 'Main Course', 'Starters', 'Sides', 'Desserts', 'Drinks'] as const;
type CategoryTab = typeof CATEGORY_TABS[number];

/** Dish Card for the POS Grid */
const MenuCard: React.FC<{
  item: MenuItemResponse;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}> = ({ item, cartQty, onAdd, onRemove }) => {
  const [imgError, setImgError] = useState(false);
  const imgSrc = getFoodImage(item.name);
  const category = getFoodCategory(item.name, item.description);

  return (
    <div
      className={`kop-card ${cartQty > 0 ? 'kop-card--active' : ''}`}
      id={`kop-menu-card-${item.id}`}
    >
      {/* Food Photo Container */}
      <div className="kop-card-media" onClick={onAdd}>
        {!imgError ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="kop-card-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="kop-card-fallback">
            <UtensilsCrossed size={32} className="text-accent" />
          </div>
        )}
        <span className="kop-category-pill">{category}</span>
        <span className="kop-price-badge">${item.sellingPrice.toFixed(2)}</span>
        {cartQty > 0 && <span className="kop-qty-badge">{cartQty}</span>}
      </div>

      {/* Dish Details */}
      <div className="kop-card-body">
        <h4 className="kop-card-name" title={item.name} onClick={onAdd}>
          {item.name}
        </h4>
        {item.description && (
          <p className="kop-card-desc" title={item.description}>
            {item.description}
          </p>
        )}

        {/* Action Controls */}
        <div className="kop-card-actions">
          {cartQty > 0 ? (
            <div className="kop-card-controls">
              <button
                type="button"
                className="kop-ctrl-btn kop-ctrl-btn--remove"
                onClick={onRemove}
                aria-label={`Remove one ${item.name}`}
              >
                <Minus size={13} />
              </button>
              <span className="kop-ctrl-qty">{cartQty} in order</span>
              <button
                type="button"
                className="kop-ctrl-btn kop-ctrl-btn--add"
                onClick={onAdd}
                aria-label={`Add one more ${item.name}`}
              >
                <Plus size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="kop-add-btn"
              onClick={onAdd}
              aria-label={`Add ${item.name} to order`}
            >
              <Plus size={14} />
              <span>Add to Order</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Cart Ticket Row */
const CartRow: React.FC<{
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}> = ({ item, onIncrease, onDecrease, onRemove }) => (
  <div className="kop-cart-row">
    <div className="kop-cart-thumb-wrap">
      <img
        src={getFoodImage(item.menuItem.name)}
        alt={item.menuItem.name}
        className="kop-cart-thumb"
        onError={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
        }}
      />
    </div>

    <div className="kop-cart-info">
      <strong className="kop-cart-name">{item.menuItem.name}</strong>
      <span className="kop-cart-unit-price">${item.menuItem.sellingPrice.toFixed(2)} each</span>
    </div>

    <div className="kop-cart-qty-wrap">
      <button type="button" className="kop-stepper" onClick={onDecrease} aria-label="Decrease quantity">
        <Minus size={11} />
      </button>
      <span className="kop-stepper-val">{item.quantity}</span>
      <button type="button" className="kop-stepper" onClick={onIncrease} aria-label="Increase quantity">
        <Plus size={11} />
      </button>
    </div>

    <div className="kop-cart-line-total">
      ${(item.menuItem.sellingPrice * item.quantity).toFixed(2)}
    </div>

    <button
      type="button"
      className="kop-cart-remove"
      onClick={onRemove}
      title={`Remove ${item.menuItem.name}`}
      aria-label={`Remove ${item.menuItem.name}`}
    >
      <X size={14} />
    </button>
  </div>
);

export const KitchenOrderPanel: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('All Dishes');
  const [orderPlaced, setOrderPlaced] = useState(0);

  const canOrder = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF', 'SYSTEM_ADMIN'].includes(user?.role ?? '');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, summary] = await Promise.all([
        api.getMenuItems(),
        api.getSalesSummary().catch(() => null),
      ]);
      setMenuItems(menu.filter((m) => m.isActive));
      setSalesSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu items.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const addItem = (menuItem: MenuItemResponse) => {
    setCart((prev) => {
      const found = prev.find((ci) => ci.menuItem.id === menuItem.id);
      if (found) {
        return prev.map((ci) =>
          ci.menuItem.id === menuItem.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prev, { menuItem, quantity: 1 }];
    });
  };

  const removeOne = (id: string) => {
    setCart((prev) =>
      prev
        .map((ci) => (ci.menuItem.id === id ? { ...ci, quantity: ci.quantity - 1 } : ci))
        .filter((ci) => ci.quantity > 0)
    );
  };

  const removeAll = (id: string) => setCart((prev) => prev.filter((ci) => ci.menuItem.id !== id));
  const clearCart = () => setCart([]);

  const cartQtyFor = (id: string) => cart.find((ci) => ci.menuItem.id === id)?.quantity ?? 0;
  const cartTotal = useMemo(
    () => cart.reduce((s, ci) => s + ci.menuItem.sellingPrice * ci.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((s, ci) => s + ci.quantity, 0), [cart]);

  // Filtered dishes
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return menuItems.filter((m) => {
      const matchesSearch =
        !q || m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
      const cat = getFoodCategory(m.name, m.description);
      const matchesCategory = selectedCategory === 'All Dishes' || cat === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, query, selectedCategory]);

  const submitOrder = async () => {
    if (cart.length === 0 || !canOrder || busy) return;
    setBusy(true);
    setError(null);
    try {
      const req: CreateSaleRequest = {
        items: cart.map((ci) => ({ menuItemId: ci.menuItem.id, quantity: ci.quantity })),
      };
      await api.createSale(req);
      const total = cartTotal;
      clearCart();
      setSuccessMsg(`Order placed successfully! Total: $${total.toFixed(2)} · Stock deducted via FEFO.`);
      setOrderPlaced((p) => p + 1);
      setTimeout(() => setSuccessMsg(null), 5000);
      const summary = await api.getSalesSummary().catch(() => null);
      if (summary) setSalesSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place kitchen order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view-container">
      {/* ─── 1. POS Top Hero Header ───────────────────────────────────────── */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <ChefHat size={22} className="text-accent" />
            Kitchen Order Panel &amp; POS
          </h2>
          <p>Tap dishes to build a customer order. Submitting auto-deducts ingredient batches using FEFO rules.</p>
        </div>
        <div className="hub-role-status">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void loadData()}
            disabled={loading || busy}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh Menu</span>
          </button>
        </div>
      </div>

      {/* ─── 2. POS KPI Stats Row ─────────────────────────────────────────── */}
      <div className="kop-kpi-bar">
        <div className="kop-kpi">
          <span className="kop-kpi-label">Today's Orders</span>
          <span className="kop-kpi-val">{salesSummary?.totalSales ?? 0}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Today's Revenue</span>
          <span className="kop-kpi-val text-emerald">${(salesSummary?.totalRevenue ?? 0).toFixed(2)}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Avg Order Value</span>
          <span className="kop-kpi-val">${(salesSummary?.averageOrderValue ?? 0).toFixed(2)}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Active Dishes</span>
          <span className="kop-kpi-val">{menuItems.length}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Session Tickets</span>
          <span className="kop-kpi-val text-accent">{orderPlaced}</span>
        </div>
      </div>

      {/* ─── 3. System Alerts ─────────────────────────────────────────────── */}
      {error && (
        <div className="alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert-success">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}
      {!canOrder && (
        <div className="alert-error">
          <AlertCircle size={16} />
          <span>Your current role ({user?.role?.replace(/_/g, ' ')}) has read-only POS access.</span>
        </div>
      )}

      {/* ─── 4. Main POS Split Screen: Menu vs Order Ticket ───────────────── */}
      <div className="kop-layout">
        {/* ── LEFT: Menu Catalog ── */}
        <div className="kop-menu-section">
          {/* Filter Bar: Categories + Search */}
          <div className="kop-filter-container">
            {/* Category Pills */}
            <div className="kop-category-tabs">
              {CATEGORY_TABS.map((cat) => {
                const count =
                  cat === 'All Dishes'
                    ? menuItems.length
                    : menuItems.filter((m) => getFoodCategory(m.name, m.description) === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`kop-category-tab ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    <span>{cat}</span>
                    <span className="kop-tab-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            <div className="kop-search-box">
              <Search size={15} className="kop-search-icon" />
              <input
                id="kop-search"
                type="text"
                placeholder="Filter dishes by name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="kop-search-clear"
                  onClick={() => setQuery('')}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Dishes Grid */}
          {loading ? (
            <div className="table-loading-box">
              <RefreshCw size={22} className="spin text-accent mb-2" />
              <span>Loading fresh dishes from kitchen catalog...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-box">
              <ChefHat size={36} className="text-muted mb-2" />
              <h4>No matching dishes</h4>
              <p className="text-muted text-sm">
                {query
                  ? `No items found matching "${query}".`
                  : `No dishes listed in ${selectedCategory}.`}
              </p>
              {(query || selectedCategory !== 'All Dishes') && (
                <button
                  type="button"
                  className="btn-secondary btn-sm mt-3"
                  onClick={() => {
                    setQuery('');
                    setSelectedCategory('All Dishes');
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="kop-grid">
              {filtered.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  cartQty={cartQtyFor(item.id)}
                  onAdd={() => addItem(item)}
                  onRemove={() => removeOne(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Tactical Order Ticket (Cart) ── */}
        <aside className="kop-cart">
          {/* Ticket Header */}
          <div className="kop-cart-hdr">
            <div className="kop-cart-hdr-title">
              <Receipt size={17} className="text-accent" />
              <span>Current Order</span>
              {cartCount > 0 && <span className="kop-cart-count-badge">{cartCount} items</span>}
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                className="kop-clear-all"
                onClick={clearCart}
                title="Clear current order"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Ticket Body: Scrollable Item List */}
          <div className="kop-cart-body">
            {cart.length === 0 ? (
              <div className="kop-cart-empty">
                <ShoppingCart size={36} className="text-muted mb-2" style={{ opacity: 0.3 }} />
                <strong>No items selected</strong>
                <p className="text-secondary text-sm">Tap dishes on the left menu to build a customer order ticket.</p>
              </div>
            ) : (
              cart.map((ci) => (
                <CartRow
                  key={ci.menuItem.id}
                  item={ci}
                  onIncrease={() => addItem(ci.menuItem)}
                  onDecrease={() => removeOne(ci.menuItem.id)}
                  onRemove={() => removeAll(ci.menuItem.id)}
                />
              ))
            )}
          </div>

          {/* Ticket Footer */}
          {cart.length > 0 && (
            <div className="kop-cart-ftr">
              {/* Itemized summary lines */}
              <div className="kop-cart-lines">
                {cart.map((ci) => (
                  <div key={ci.menuItem.id} className="kop-cart-line">
                    <span className="kop-line-name">
                      {ci.menuItem.name} <span className="text-muted">×{ci.quantity}</span>
                    </span>
                    <span className="kop-line-val font-mono">
                      ${(ci.menuItem.sellingPrice * ci.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="kop-divider" />

              {/* Grand Total */}
              <div className="kop-total-row">
                <div className="kop-total-label-group">
                  <span className="kop-total-title">Total Amount</span>
                  <span className="kop-total-sub">{cartCount} items in ticket</span>
                </div>
                <span className="kop-total-amt">${cartTotal.toFixed(2)}</span>
              </div>

              {/* FEFO Traceability Notice */}
              <div className="kop-fefo-notice">
                <Sparkles size={13} className="text-accent" />
                <span>Ingredients deducted using FEFO First-Expired First-Out rules.</span>
              </div>

              {/* Submit Order Action */}
              <button
                id="kop-place-order-btn"
                type="button"
                className="btn-primary kop-place-btn"
                disabled={!canOrder || busy}
                onClick={() => void submitOrder()}
              >
                {busy ? (
                  <>
                    <RefreshCw size={15} className="spin" />
                    <span>Placing Order &amp; Deducting Stock...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Place Order · ${cartTotal.toFixed(2)}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
