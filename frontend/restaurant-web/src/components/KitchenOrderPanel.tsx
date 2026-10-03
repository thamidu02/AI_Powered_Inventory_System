import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChefHat,
  Info,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  Utensils,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type {
  MenuItemResponse,
  CreateSaleRequest,
  SalesSummaryResponse,
  RecipeResponse,
  InventoryResponse,
} from '../types';

// ─── Image mapping ────────────────────────────────────────────────────────────
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

// ─── Categories & Filters ─────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Burgers', 'Pizzas', 'Pastas', 'Salads', 'Mains', 'Sides & Drinks'] as const;
type CategoryType = (typeof CATEGORIES)[number];

const matchesCategory = (item: MenuItemResponse, cat: CategoryType): boolean => {
  if (cat === 'All') return true;
  const text = (item.name + ' ' + (item.description ?? '')).toLowerCase();
  switch (cat) {
    case 'Burgers':
      return /burger|beef|patty|cheeseburger|slider/i.test(text);
    case 'Pizzas':
      return /pizza|margherita|pepperoni|calzone/i.test(text);
    case 'Pastas':
      return /pasta|spaghetti|carbonara|bolognese|linguine|fettuccine|penne|lasagna|noodle/i.test(text);
    case 'Salads':
      return /salad|caesar|greek|coleslaw|greens/i.test(text);
    case 'Mains':
      return (
        /steak|ribs|curry|rice|platter|roast|grill|chicken|salmon|fish/i.test(text) &&
        !/salad|burger|pizza|pasta/i.test(text)
      );
    case 'Sides & Drinks':
      return /fries|chips|soup|wings|onion ring|coke|soda|beverage|juice|tea|coffee|dessert|cake|brownie|ice cream/i.test(
        text
      );
    default:
      return true;
  }
};

const QUICK_MODIFIERS = [
  'No Onion',
  'Extra Spicy',
  'Sauce on Side',
  'Well Done',
  'Gluten Free',
  'Cut in Half',
  'Dairy Free',
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface CartItem {
  menuItem: MenuItemResponse;
  quantity: number;
}

interface PortionInfo {
  recipe: RecipeResponse | null;
  portions: number | null; // null if untracked / no recipe
  isSoldOut: boolean;
  isLowStock: boolean;
}

const getPortionInfo = (
  item: MenuItemResponse,
  recipes: RecipeResponse[],
  inventoryMap: Map<string, InventoryResponse>
): PortionInfo => {
  const recipe =
    recipes.find((r) => r.menuItemId === item.id && r.isActive) ||
    recipes.find((r) => r.menuItemId === item.id) ||
    null;

  if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
    return { recipe: null, portions: null, isSoldOut: false, isLowStock: false };
  }

  let minPortions = Infinity;
  for (const ing of recipe.ingredients) {
    if (ing.quantityRequired > 0) {
      const inv = inventoryMap.get(ing.ingredientId);
      const stock = inv ? inv.currentStock : 0;
      const portionsForIng = Math.floor(stock / ing.quantityRequired);
      if (portionsForIng < minPortions) {
        minPortions = portionsForIng;
      }
    }
  }

  const portions = minPortions === Infinity ? null : Math.max(0, minPortions);
  const isSoldOut = portions !== null && portions <= 0;
  const isLowStock = portions !== null && portions > 0 && portions <= 5;

  return { recipe, portions, isSoldOut, isLowStock };
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Clean card with food photo, portion availability badge, and specs trigger */
const MenuCard: React.FC<{
  item: MenuItemResponse;
  portionInfo: PortionInfo;
  cartQty: number;
  onAdd: () => void;
  onRemove: () => void;
  onOpenSpec: () => void;
}> = ({ item, portionInfo, cartQty, onAdd, onRemove, onOpenSpec }) => {
  const [imgError, setImgError] = useState(false);
  const imgSrc = getMenuImage(item.name);
  const gradient = hashGradient(item.name);
  const { isSoldOut, isLowStock, portions } = portionInfo;

  return (
    <div
      className={`kop-card ${cartQty > 0 ? 'kop-card--active' : ''} ${
        isSoldOut ? 'kop-card--soldout' : ''
      }`}
      id={`kop-menu-card-${item.id}`}
    >
      {/* Food image on top */}
      <div
        className="kop-card-media"
        onClick={() => {
          if (!isSoldOut) onAdd();
        }}
      >
        {!imgError ? (
          <img
            src={imgSrc}
            alt={item.name}
            className="kop-card-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="kop-card-fallback" style={{ background: gradient }}>
            <span className="kop-card-initial">{item.name.charAt(0).toUpperCase()}</span>
          </div>
        )}

        {/* Price badge */}
        <span className="kop-price-badge">${item.sellingPrice.toFixed(2)}</span>

        {/* Cart quantity badge */}
        {cartQty > 0 && <span className="kop-qty-badge">{cartQty}</span>}

        {/* Portion availability & 86 indicator */}
        {isSoldOut ? (
          <span className="kop-portion-badge kop-portion-badge--soldout">86'd · Sold Out</span>
        ) : isLowStock ? (
          <span className="kop-portion-badge kop-portion-badge--low">
            Low: {portions} left
          </span>
        ) : portions !== null ? (
          <span className="kop-portion-badge kop-portion-badge--ok">
            {portions} portions
          </span>
        ) : (
          <span className="kop-portion-badge kop-portion-badge--ok">Available</span>
        )}
      </div>

      {/* Details below the food card */}
      <div className="kop-card-body">
        <div className="kop-card-top-row">
          <h4
            className="kop-card-name"
            title={item.name}
            onClick={() => {
              if (!isSoldOut) onAdd();
            }}
          >
            {item.name}
          </h4>
          <button
            type="button"
            className="kop-spec-btn"
            title="View Recipe & Ingredients Spec"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpec();
            }}
            aria-label={`View recipe specs for ${item.name}`}
          >
            <Info size={13} />
          </button>
        </div>

        {item.description && (
          <p className="kop-card-desc" title={item.description}>
            {item.description}
          </p>
        )}

        {/* Small clean action controls */}
        <div className="kop-card-actions">
          {isSoldOut ? (
            <button type="button" className="kop-add-btn" disabled>
              <span>86'd (Sold Out)</span>
            </button>
          ) : cartQty > 0 ? (
            <div className="kop-card-controls">
              <button
                type="button"
                className="kop-ctrl-btn kop-ctrl-btn--remove"
                onClick={onRemove}
                aria-label={`Remove one ${item.name}`}
              >
                <Minus size={12} />
              </button>
              <span className="kop-ctrl-qty">{cartQty} in order</span>
              <button
                type="button"
                className="kop-ctrl-btn kop-ctrl-btn--add"
                onClick={onAdd}
                disabled={portions !== null && cartQty >= portions}
                title={
                  portions !== null && cartQty >= portions
                    ? 'No more portions in stock'
                    : `Add one more ${item.name}`
                }
                aria-label={`Add one more ${item.name}`}
              >
                <Plus size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="kop-add-btn"
              onClick={onAdd}
              aria-label={`Add ${item.name} to order`}
            >
              <Plus size={13} />
              <span>Add to Order</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Compact row inside the cart sidebar */
const CartRow: React.FC<{
  item: CartItem;
  maxAvailable: number | null;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}> = ({ item, maxAvailable, onIncrease, onDecrease, onRemove }) => (
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
      <span className="text-xs text-muted">${item.menuItem.sellingPrice.toFixed(2)}</span>
    </div>

    <div className="kop-cart-qty-wrap">
      <button type="button" className="kop-stepper" onClick={onDecrease} aria-label="decrease">
        <Minus size={10} />
      </button>
      <span className="kop-stepper-val">{item.quantity}</span>
      <button
        type="button"
        className="kop-stepper"
        onClick={onIncrease}
        disabled={maxAvailable !== null && item.quantity >= maxAvailable}
        title={
          maxAvailable !== null && item.quantity >= maxAvailable
            ? 'Stock limit reached'
            : 'Add one'
        }
        aria-label="increase"
      >
        <Plus size={10} />
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
      <X size={12} />
    </button>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const KitchenOrderPanel: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('All');
  const [orderPlaced, setOrderPlaced] = useState(0);

  // Operational State
  const [diningMode, setDiningMode] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState('');
  const [hasAllergyAlert, setHasAllergyAlert] = useState(false);
  const [allergyNote, setAllergyNote] = useState('');

  // Recipe specs modal
  const [specModalItem, setSpecModalItem] = useState<MenuItemResponse | null>(null);

  const canOrder = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF'].includes(user?.role ?? '');

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, summary, recipeData, invData] = await Promise.all([
        api.getMenuItems(),
        api.getSalesSummary().catch(() => null),
        api.getRecipes().catch(() => []),
        api.getInventory().catch(() => []),
      ]);
      setMenuItems(menu.filter((m) => m.isActive));
      setSalesSummary(summary);
      setRecipes(recipeData);
      setInventory(invData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Inventory Map for fast lookup
  const inventoryMap = useMemo(() => {
    return new Map(inventory.map((i) => [i.ingredientId, i]));
  }, [inventory]);

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addItem = (menuItem: MenuItemResponse) => {
    const info = getPortionInfo(menuItem, recipes, inventoryMap);
    if (info.isSoldOut) return;

    setCart((prev) => {
      const found = prev.find((ci) => ci.menuItem.id === menuItem.id);
      if (found) {
        if (info.portions !== null && found.quantity >= info.portions) {
          return prev;
        }
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

  // Toggle modifier chip
  const toggleModifier = (mod: string) => {
    setSelectedModifiers((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  // ── Filtered menu ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = menuItems;
    if (selectedCategory !== 'All') {
      list = list.filter((m) => matchesCategory(m, selectedCategory));
    }
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [menuItems, selectedCategory, query]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      counts[cat] = menuItems.filter((m) => matchesCategory(m, cat)).length;
    }
    return counts;
  }, [menuItems]);

  // ── Submit Order ───────────────────────────────────────────────────────────
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

      const metaParts: string[] = [];
      if (diningMode === 'DINE_IN') metaParts.push(tableNumber ? `Table ${tableNumber}` : 'Dine-In');
      else if (diningMode === 'TAKEAWAY')
        metaParts.push(tableNumber ? `Buzzer #${tableNumber}` : 'Takeaway');
      else metaParts.push('Delivery');

      if (selectedModifiers.length > 0) {
        metaParts.push(selectedModifiers.join(', '));
      }
      if (customNote.trim()) {
        metaParts.push(`"${customNote.trim()}"`);
      }
      if (hasAllergyAlert) {
        metaParts.push(`⚠️ Allergy: ${allergyNote || 'Severe'}`);
      }

      const metaStr = metaParts.length > 0 ? ` [${metaParts.join(' · ')}]` : '';

      clearCart();
      setTableNumber('');
      setSelectedModifiers([]);
      setCustomNote('');
      setHasAllergyAlert(false);
      setAllergyNote('');

      setSuccessMsg(`Order placed! $${total.toFixed(2)}${metaStr} · Ingredients deducted via FEFO.`);
      setOrderPlaced((p) => p + 1);
      setTimeout(() => setSuccessMsg(null), 6000);

      // Refresh sales summary & inventory to recompute available portions immediately
      const [summary, inv] = await Promise.all([
        api.getSalesSummary().catch(() => null),
        api.getInventory().catch(() => []),
      ]);
      if (summary) setSalesSummary(summary);
      if (inv) setInventory(inv);
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
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '1.25rem' }}>
            <ChefHat size={20} className="text-accent" />
            Kitchen Order Panel
          </h2>
          <p>
            Real-time portion tracking with automated 86-lockout, custom kitchen modifiers, and FEFO stock deduction.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadData()}
          disabled={loading || busy}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
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
          <span className="kop-kpi-val text-emerald">
            ${(salesSummary?.totalRevenue ?? 0).toFixed(2)}
          </span>
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
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {successMsg && (
        <div className="alert-success" style={{ margin: '0.75rem 0' }}>
          <CheckCircle2 size={15} /> {successMsg}
        </div>
      )}
      {!canOrder && (
        <div className="alert-error" style={{ margin: '0.75rem 0' }}>
          <AlertCircle size={15} />
          Your role (<strong>{user?.role}</strong>) cannot place orders.
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="kop-layout">
        {/* ── LEFT: Menu grid & Categories ── */}
        <div className="kop-menu-section">
          {/* Search bar */}
          <div className="kop-search-wrap">
            <Search size={14} className="kop-search-icon" />
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

          {/* Category Filter Pills (Phase 1) */}
          <div className="kop-cat-bar" role="tablist" aria-label="Menu Categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`kop-cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <span>{cat}</span>
                <span className="kop-cat-count">({categoryCounts[cat] ?? 0})</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="kop-loading">
              <RefreshCw size={20} className="spin text-accent" />
              <p className="text-muted text-sm">Loading menu…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">No dishes match the selected category or search filter.</div>
          ) : (
            <div className="kop-grid">
              {filtered.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  portionInfo={getPortionInfo(item, recipes, inventoryMap)}
                  cartQty={cartQtyFor(item.id)}
                  onAdd={() => addItem(item)}
                  onRemove={() => removeOne(item.id)}
                  onOpenSpec={() => setSpecModalItem(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Cart & Order Preparation ── */}
        <aside className="kop-cart">
          {/* Cart header */}
          <div className="kop-cart-hdr">
            <div className="kop-cart-hdr-title">
              <ShoppingCart size={15} />
              <span>Current Order</span>
              {cartCount > 0 && <span className="kop-cart-count-badge">{cartCount}</span>}
            </div>
            {cart.length > 0 && (
              <button type="button" className="kop-clear-all" onClick={clearCart}>
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {/* Cart body */}
          <div className="kop-cart-body">
            {/* Dining Mode Toggle (Phase 1) */}
            <div className="kop-dining-bar" role="group" aria-label="Dining Mode">
              <button
                type="button"
                className={`kop-dining-btn ${diningMode === 'DINE_IN' ? 'active' : ''}`}
                onClick={() => setDiningMode('DINE_IN')}
              >
                <Utensils size={12} /> Dine-In
              </button>
              <button
                type="button"
                className={`kop-dining-btn ${diningMode === 'TAKEAWAY' ? 'active' : ''}`}
                onClick={() => setDiningMode('TAKEAWAY')}
              >
                <ShoppingBag size={12} /> Takeaway
              </button>
              <button
                type="button"
                className={`kop-dining-btn ${diningMode === 'DELIVERY' ? 'active' : ''}`}
                onClick={() => setDiningMode('DELIVERY')}
              >
                <Truck size={12} /> Delivery
              </button>
            </div>

            {/* Table / Buzzer & Modifier Inputs (Phase 1) */}
            <div className="kop-meta-box">
              <input
                type="text"
                className="kop-table-input"
                placeholder={
                  diningMode === 'DINE_IN'
                    ? 'Table Number (e.g. Table 4)'
                    : diningMode === 'TAKEAWAY'
                    ? 'Buzzer / Token # (e.g. #12)'
                    : 'Delivery Order / Address'
                }
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />

              {/* Quick Modifier Chips */}
              <div style={{ marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                  Quick Modifiers:
                </span>
                <div className="kop-chips-wrap">
                  {QUICK_MODIFIERS.map((mod) => (
                    <button
                      key={mod}
                      type="button"
                      className={`kop-chip ${selectedModifiers.includes(mod) ? 'active' : ''}`}
                      onClick={() => toggleModifier(mod)}
                    >
                      {mod}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Kitchen Note */}
              <input
                type="text"
                className="kop-table-input"
                placeholder="Kitchen notes (e.g. extra crispy)..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                style={{ fontSize: '0.74rem' }}
              />

              {/* Allergy Alert Toggle (Phase 4) */}
              <label className="kop-allergy-toggle">
                <input
                  type="checkbox"
                  checked={hasAllergyAlert}
                  onChange={(e) => setHasAllergyAlert(e.target.checked)}
                />
                <AlertTriangle size={13} />
                <span>Severe Allergy Alert</span>
              </label>

              {hasAllergyAlert && (
                <input
                  type="text"
                  className="kop-table-input"
                  placeholder="Specify allergens (e.g. Nut, Shellfish)..."
                  value={allergyNote}
                  onChange={(e) => setAllergyNote(e.target.value)}
                  style={{ borderColor: '#fca5a5', background: '#fff1f2' }}
                  autoFocus
                />
              )}
            </div>

            {/* High Visibility Allergy Banner */}
            {hasAllergyAlert && (
              <div className="kop-allergy-banner">
                <AlertTriangle size={14} />
                <span>ALLERGY NOTICE: {allergyNote || 'Check chef prep instructions'}</span>
              </div>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="kop-cart-empty">
                <ShoppingCart size={24} className="text-muted" style={{ opacity: 0.25 }} />
                <p className="text-muted text-sm" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  Tap a dish to add it here
                </p>
              </div>
            ) : (
              cart.map((ci) => {
                const portionInfo = getPortionInfo(ci.menuItem, recipes, inventoryMap);
                return (
                  <CartRow
                    key={ci.menuItem.id}
                    item={ci}
                    maxAvailable={portionInfo.portions}
                    onIncrease={() => addItem(ci.menuItem)}
                    onDecrease={() => removeOne(ci.menuItem.id)}
                    onRemove={() => removeAll(ci.menuItem.id)}
                  />
                );
              })
            )}
          </div>

          {/* Cart footer */}
          {cart.length > 0 && (
            <div className="kop-cart-ftr">
              {/* Line items summary */}
              <div className="kop-cart-lines">
                {cart.map((ci) => (
                  <div key={ci.menuItem.id} className="kop-cart-line">
                    <span className="text-muted text-xs">
                      {ci.menuItem.name} ×{ci.quantity}
                    </span>
                    <span className="text-xs">
                      ${(ci.menuItem.sellingPrice * ci.quantity).toFixed(2)}
                    </span>
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
                  <>
                    <RefreshCw size={14} className="spin" /> Placing…
                  </>
                ) : (
                  <>
                    <Receipt size={15} /> Place Order · ${cartTotal.toFixed(2)}
                  </>
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

      {/* ── Line Cook Recipe & Portion Spec Modal (Phase 4) ── */}
      {specModalItem && (
        <div className="kop-modal-overlay" onClick={() => setSpecModalItem(null)}>
          <div className="kop-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="kop-modal-hdr">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  {specModalItem.name}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Kitchen Recipe & Portioning Specification
                </span>
              </div>
              <button
                type="button"
                className="kop-cart-remove"
                onClick={() => setSpecModalItem(null)}
                aria-label="Close specification"
              >
                <X size={16} />
              </button>
            </div>

            <div className="kop-modal-body">
              {/* Quick summary badges */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  marginBottom: '0.85rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                  Selling Price: ${specModalItem.sellingPrice.toFixed(2)}
                </span>
                {(() => {
                  const pi = getPortionInfo(specModalItem, recipes, inventoryMap);
                  if (pi.isSoldOut) {
                    return (
                      <span
                        className="kop-portion-badge kop-portion-badge--soldout"
                        style={{ position: 'static' }}
                      >
                        86'd · Out of Stock
                      </span>
                    );
                  }
                  if (pi.isLowStock) {
                    return (
                      <span
                        className="kop-portion-badge kop-portion-badge--low"
                        style={{ position: 'static' }}
                      >
                        Low Stock: {pi.portions} Portions Left
                      </span>
                    );
                  }
                  if (pi.portions !== null) {
                    return (
                      <span
                        className="kop-portion-badge kop-portion-badge--ok"
                        style={{ position: 'static' }}
                      >
                        {pi.portions} Portions Available
                      </span>
                    );
                  }
                  return (
                    <span
                      className="kop-portion-badge kop-portion-badge--ok"
                      style={{ position: 'static' }}
                    >
                      Portions Ready
                    </span>
                  );
                })()}
              </div>

              {specModalItem.description && (
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#475569',
                    marginBottom: '0.85rem',
                    lineHeight: 1.4,
                  }}
                >
                  {specModalItem.description}
                </p>
              )}

              {(() => {
                const pi = getPortionInfo(specModalItem, recipes, inventoryMap);
                if (!pi.recipe || !pi.recipe.ingredients || pi.recipe.ingredients.length === 0) {
                  return (
                    <div
                      style={{
                        padding: '1rem',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: '0.82rem',
                      }}
                    >
                      No active recipe ingredient specs mapped for this menu item.
                    </div>
                  );
                }

                return (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#334155',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Ingredients Required per Portion
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Recipe v{pi.recipe.version}
                      </span>
                    </div>
                    <table className="kop-spec-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th>Per Portion</th>
                          <th>Current Stock</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pi.recipe.ingredients.map((ing) => {
                          const inv = inventoryMap.get(ing.ingredientId);
                          const stock = inv ? inv.currentStock : 0;
                          const isDepleted = stock < ing.quantityRequired;
                          const isLow = !isDepleted && stock <= ing.quantityRequired * 5;

                          return (
                            <tr key={ing.ingredientId}>
                              <td style={{ fontWeight: 600 }}>{ing.ingredientName}</td>
                              <td>
                                {ing.quantityRequired} {ing.unit}
                              </td>
                              <td>
                                {stock} {ing.unit}
                              </td>
                              <td>
                                {isDepleted ? (
                                  <span className="kop-spec-status kop-spec-status--out">
                                    Depleted
                                  </span>
                                ) : isLow ? (
                                  <span className="kop-spec-status kop-spec-status--low">
                                    Low
                                  </span>
                                ) : (
                                  <span className="kop-spec-status kop-spec-status--ok">
                                    In Stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div
                      style={{
                        marginTop: '1rem',
                        padding: '0.65rem 0.75rem',
                        background: '#f0f9ff',
                        borderRadius: '8px',
                        border: '1px solid #bae6fd',
                        fontSize: '0.76rem',
                        color: '#0369a1',
                      }}
                    >
                      💡 <strong>Line Cook Prep Guidance:</strong> Ingredients are automatically deducted
                      using First-Expired, First-Out (FEFO) logic upon order confirmation.
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="kop-modal-ftr">
              <button
                type="button"
                className="btn-secondary"
                style={{ marginRight: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                onClick={() => setSpecModalItem(null)}
              >
                Close
              </button>
              {(() => {
                const pi = getPortionInfo(specModalItem, recipes, inventoryMap);
                return (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}
                    disabled={pi.isSoldOut}
                    onClick={() => {
                      addItem(specModalItem);
                      setSpecModalItem(null);
                    }}
                  >
                    {pi.isSoldOut ? 'Sold Out' : 'Add to Order'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
