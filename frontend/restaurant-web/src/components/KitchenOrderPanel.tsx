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
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type { MenuItemResponse, CreateSaleRequest, SalesSummaryResponse } from '../types';

// ─── Image mapping ────────────────────────────────────────────────────────────
// Maps keywords in menu item names to pre-generated food photos served from /menu-images/
const IMAGE_MAP: { keywords: string[]; src: string }[] = [
  { keywords: ['burger', 'beef', 'cheeseburger'], src: '/menu-images/burger.jpg' },
  { keywords: ['pizza', 'pepperoni', 'margherita'], src: '/menu-images/pizza.jpg' },
  { keywords: ['pasta', 'spaghetti', 'carbonara', 'bolognese', 'linguine', 'fettuccine', 'noodle'], src: '/menu-images/pasta.jpg' },
  { keywords: ['salad', 'caesar', 'greek', 'coleslaw'], src: '/menu-images/salad.jpg' },
  { keywords: ['chicken', 'grilled', 'fried chicken', 'wings', 'poultry'], src: '/menu-images/chicken.jpg' },
  { keywords: ['rice', 'bowl', 'fried rice', 'biryani', 'pilaf'], src: '/menu-images/rice.jpg' },
  { keywords: ['soup', 'bisque', 'chowder', 'broth', 'stew'], src: '/menu-images/soup.jpg' },
];

const getMenuImage = (name: string): string => {
  const lower = name.toLowerCase();
  for (const entry of IMAGE_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) return entry.src;
  }
  return '/menu-images/default.jpg';
};

// Gradient backgrounds used as image fallback (by name hash)
const CARD_GRADIENTS = [
  'linear-gradient(135deg,#7c3aed,#4f46e5)',
  'linear-gradient(135deg,#0891b2,#0d9488)',
  'linear-gradient(135deg,#b45309,#d97706)',
  'linear-gradient(135deg,#be185d,#e11d48)',
  'linear-gradient(135deg,#15803d,#16a34a)',
  'linear-gradient(135deg,#9333ea,#db2777)',
  'linear-gradient(135deg,#1d4ed8,#0891b2)',
  'linear-gradient(135deg,#92400e,#b45309)',
];

const hashGradient = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return CARD_GRADIENTS[Math.abs(h) % CARD_GRADIENTS.length];
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface CartItem {
  menuItem: MenuItemResponse;
  quantity: number;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Large picture card shown in the menu grid */
const MenuCard: React.FC<{
  item: MenuItemResponse;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
}> = ({ item, cartQty, onAdd, onRemove }) => {
  const [imgError, setImgError] = useState(false);
  const imgSrc = getMenuImage(item.name);
  const gradient = hashGradient(item.name);

  return (
    <div
      className={`kop-card ${cartQty > 0 ? 'kop-card--active' : ''}`}
      id={`kop-menu-card-${item.id}`}
    >
      {/* Picture header */}
      <div className="kop-card-image-wrap" onClick={onAdd}>
        {!imgError ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="kop-card-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="kop-card-img-fallback" style={{ background: gradient }}>
            <span className="kop-card-initial">{item.name.charAt(0).toUpperCase()}</span>
          </div>
        )}

        {/* Price badge */}
        <div className="kop-price-badge">${item.sellingPrice.toFixed(2)}</div>

        {/* Cart quantity badge */}
        {cartQty > 0 && (
          <div className="kop-qty-badge">{cartQty}</div>
        )}

        {/* Hover overlay */}
        <div className="kop-card-overlay">
          <Plus size={28} />
          <span>Add to order</span>
        </div>
      </div>

      {/* Info footer */}
      <div className="kop-card-body">
        <div className="kop-card-name" title={item.name}>{item.name}</div>
        {item.description && (
          <div className="kop-card-desc">{item.description}</div>
        )}

        {/* Quick qty controls when item is in cart */}
        {cartQty > 0 ? (
          <div className="kop-card-controls">
            <button
              type="button"
              className="kop-ctrl-btn kop-ctrl-btn--remove"
              onClick={onRemove}
              aria-label={`Remove one ${item.name}`}
            >
              <Minus size={14} />
            </button>
            <span className="kop-ctrl-qty">{cartQty} in order</span>
            <button
              type="button"
              className="kop-ctrl-btn kop-ctrl-btn--add"
              onClick={onAdd}
              aria-label={`Add one more ${item.name}`}
            >
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="kop-add-btn"
            onClick={onAdd}
            aria-label={`Add ${item.name} to order`}
          >
            <Plus size={14} /> Add
          </button>
        )}
      </div>
    </div>
  );
};

/** Compact row inside the cart sidebar */
const CartRow: React.FC<{
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}> = ({ item, onIncrease, onDecrease, onRemove }) => (
  <div className="kop-cart-row">
    <div className="kop-cart-thumb-wrap">
      <img
        src={getMenuImage(item.menuItem.name)}
        alt={item.menuItem.name}
        className="kop-cart-thumb"
        onError={(e) => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
          const next = el.nextElementSibling as HTMLElement | null;
          if (next) next.style.display = 'flex';
        }}
      />
      <div
        className="kop-cart-thumb-fb"
        style={{ background: hashGradient(item.menuItem.name), display: 'none' }}
      >
        {item.menuItem.name.charAt(0)}
      </div>
    </div>

    <div className="kop-cart-info">
      <strong className="kop-cart-name">{item.menuItem.name}</strong>
      <span className="text-xs text-muted">${item.menuItem.sellingPrice.toFixed(2)} each</span>
    </div>

    <div className="kop-cart-qty-wrap">
      <button type="button" className="kop-stepper" onClick={onDecrease} aria-label="decrease">
        <Minus size={11} />
      </button>
      <span className="kop-stepper-val">{item.quantity}</span>
      <button type="button" className="kop-stepper" onClick={onIncrease} aria-label="increase">
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
      aria-label={`Remove ${item.menuItem.name}`}
    >
      <X size={13} />
    </button>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
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
  const [orderPlaced, setOrderPlaced] = useState(0); // counter to animate success

  const canOrder = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF'].includes(user?.role ?? '');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, summary] = await Promise.all([
        api.getMenuItems(),
        api.getSalesSummary(),
      ]);
      setMenuItems(menu.filter((m) => m.isActive));
      setSalesSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addItem = (menuItem: MenuItemResponse) => {
    setCart((prev) => {
      const found = prev.find((ci) => ci.menuItem.id === menuItem.id);
      if (found) return prev.map((ci) => ci.menuItem.id === menuItem.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { menuItem, quantity: 1 }];
    });
  };

  const removeOne = (id: string) => {
    setCart((prev) =>
      prev.map((ci) => ci.menuItem.id === id ? { ...ci, quantity: ci.quantity - 1 } : ci)
          .filter((ci) => ci.quantity > 0)
    );
  };

  const removeAll = (id: string) => setCart((prev) => prev.filter((ci) => ci.menuItem.id !== id));
  const clearCart = () => setCart([]);

  const cartQtyFor = (id: string) => cart.find((ci) => ci.menuItem.id === id)?.quantity ?? 0;
  const cartTotal = useMemo(() => cart.reduce((s, ci) => s + ci.menuItem.sellingPrice * ci.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, ci) => s + ci.quantity, 0), [cart]);

  // ── Filtered menu ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    );
  }, [menuItems, query]);

  // ── Submit ─────────────────────────────────────────────────────────────────
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
      setSuccessMsg(`Order placed! $${total.toFixed(2)} · Ingredients deducted via FEFO.`);
      setOrderPlaced((p) => p + 1);
      setTimeout(() => setSuccessMsg(null), 5000);
      const summary = await api.getSalesSummary();
      setSalesSummary(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order.');
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="view-container">

      {/* ── Header ── */}
      <div className="hub-hero" style={{ marginBottom: '1.25rem' }}>
        <div className="hub-hero-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ChefHat size={26} className="text-accent" />
            Kitchen Order Panel
          </h2>
          <p>Tap a dish to add it to the order. Place order to auto-deduct all ingredients via FEFO.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadData()} disabled={loading || busy}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── KPI bar ── */}
      <div className="kop-kpi-bar">
        <div className="kop-kpi">
          <span className="kop-kpi-label">Today's Sales</span>
          <span className="kop-kpi-val">{salesSummary?.totalSales ?? 0}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Revenue</span>
          <span className="kop-kpi-val text-emerald">${(salesSummary?.totalRevenue ?? 0).toFixed(2)}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Avg Order</span>
          <span className="kop-kpi-val">${(salesSummary?.averageOrderValue ?? 0).toFixed(2)}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Items on Menu</span>
          <span className="kop-kpi-val">{menuItems.length}</span>
        </div>
        <div className="kop-kpi-divider" />
        <div className="kop-kpi">
          <span className="kop-kpi-label">Orders This Session</span>
          <span className="kop-kpi-val text-accent">{orderPlaced}</span>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="alert-error" style={{ margin: '0.75rem 0' }}>
          <AlertCircle size={17} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="alert-success" style={{ margin: '0.75rem 0' }}>
          <CheckCircle2 size={17} /> {successMsg}
        </div>
      )}
      {!canOrder && (
        <div className="alert-error" style={{ margin: '0.75rem 0' }}>
          <AlertCircle size={17} />
          Your role (<strong>{user?.role}</strong>) cannot place orders.
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="kop-layout">

        {/* ── LEFT: Menu grid ── */}
        <div className="kop-menu-section">
          {/* Search bar */}
          <div className="kop-search-wrap">
            <Search size={16} className="kop-search-icon" />
            <input
              id="kop-search"
              type="search"
              placeholder="Search dishes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="kop-search-input"
            />
            <span className="kop-search-count">{filtered.length} items</span>
          </div>

          {loading ? (
            <div className="kop-loading">
              <RefreshCw size={28} className="spin text-accent" />
              <p className="text-muted text-sm">Loading menu…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No active menu items found.</div>
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

        {/* ── RIGHT: Cart ── */}
        <aside className="kop-cart">
          {/* Cart header */}
          <div className="kop-cart-hdr">
            <div className="kop-cart-hdr-title">
              <ShoppingCart size={18} />
              <span>Current Order</span>
              {cartCount > 0 && <span className="kop-cart-count-badge">{cartCount}</span>}
            </div>
            {cart.length > 0 && (
              <button type="button" className="kop-clear-all" onClick={clearCart}>
                <Trash2 size={13} /> Clear
              </button>
            )}
          </div>

          {/* Cart body */}
          <div className="kop-cart-body">
            {cart.length === 0 ? (
              <div className="kop-cart-empty">
                <ShoppingCart size={40} className="text-muted" style={{ opacity: 0.3 }} />
                <p className="text-muted text-sm" style={{ marginTop: '0.6rem' }}>
                  Tap a dish to add it here
                </p>
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

          {/* Cart footer */}
          {cart.length > 0 && (
            <div className="kop-cart-ftr">
              {/* Line items summary */}
              <div className="kop-cart-lines">
                {cart.map((ci) => (
                  <div key={ci.menuItem.id} className="kop-cart-line">
                    <span className="text-muted text-xs">{ci.menuItem.name} ×{ci.quantity}</span>
                    <span className="text-xs">${(ci.menuItem.sellingPrice * ci.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="kop-divider" />

              {/* Total */}
              <div className="kop-total-row">
                <span className="text-muted text-sm">Total</span>
                <span className="kop-total-amt">${cartTotal.toFixed(2)}</span>
              </div>

              {/* Place order button */}
              <button
                id="kop-place-order-btn"
                type="button"
                className="btn-primary kop-place-btn"
                disabled={!canOrder || busy}
                onClick={() => void submitOrder()}
              >
                {busy ? (
                  <><RefreshCw size={17} className="spin" /> Placing…</>
                ) : (
                  <><Receipt size={17} /> Place Order · ${cartTotal.toFixed(2)}</>
                )}
              </button>

              {!canOrder && (
                <p className="text-xs text-rose text-center" style={{ marginTop: '0.4rem' }}>
                  Insufficient permissions
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
