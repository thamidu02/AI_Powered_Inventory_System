import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  UtensilsCrossed,
  Search,
  BookOpen,
  DollarSign,
  ChefHat,
  X,
  Layers,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  Check,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type {
  CreateMenuItemRequest,
  IngredientResponse,
  InventoryResponse,
  MenuItemResponse,
  RecipeResponse,
} from '../types';
import {
  getFoodImage,
  getFoodCategory,
  FOOD_IMAGE_MAP,
  saveCustomFoodImage,
  removeCustomFoodImage,
} from '../utils/foodImages';

const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

export const MenuRecipesDashboard: React.FC = () => {
  const { user } = useAuth();

  // Data States
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [inventory, setInventory] = useState<InventoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(0); // Trigger re-render on image change

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Modals & Drawers
  const [selectedRecipe, setSelectedRecipe] = useState<{ recipe: RecipeResponse; menuItem?: MenuItemResponse } | null>(null);
  const [showAddRecipeModal, setShowAddRecipeModal] = useState(false);
  const [showAddMenuModal, setShowAddMenuModal] = useState(false);
  const [editingImageDish, setEditingImageDish] = useState<{ name: string; currentUrl: string } | null>(null);
  const [customImageUrlInput, setCustomImageUrlInput] = useState('');

  // Form States - Menu Item
  const [menuName, setMenuName] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [menuPrice, setMenuPrice] = useState('');

  // Form States - Recipe
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeVersion, setRecipeVersion] = useState('1');
  const [recipeRows, setRecipeRows] = useState<{ ingredientId: string; quantityRequired: string; unit: string }[]>([
    { ingredientId: '', quantityRequired: '', unit: '' },
  ]);

  const canManageMenu = ['RESTAURANT_MANAGER', 'SALES_KITCHEN_STAFF', 'SYSTEM_ADMIN'].includes(user?.role ?? '');

  const categories = ['All', 'Main Course', 'Desserts', 'Starters', 'Sides', 'Drinks'];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, recipeData, ingredientData, inventoryData] = await Promise.all([
        api.getMenuItems(),
        api.getRecipes(),
        api.getIngredients(),
        api.getInventory().catch(() => []),
      ]);
      setMenuItems(menu);
      setRecipes(recipeData);
      setIngredients(ingredientData);
      setInventory(inventoryData);
      if (!recipeMenuItemId && menu.length > 0) {
        setRecipeMenuItemId(menu.find((item) => item.isActive)?.id || menu[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menus and recipes.');
    } finally {
      setLoading(false);
    }
  }, [recipeMenuItemId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Map stock availability lookup
  const stockMap = useMemo(() => {
    const map = new Map<string, { currentStock: number; unit: string }>();
    for (const item of inventory) {
      map.set(item.ingredientId, { currentStock: item.currentStock, unit: item.unit });
    }
    return map;
  }, [inventory]);

  // Combined Recipe Cards with Menu info
  const recipeCards = useMemo(() => {
    return menuItems.map((item) => {
      const matchedRecipe = recipes.find((r) => r.menuItemId === item.id && r.isActive) ||
        recipes.find((r) => r.menuItemId === item.id);
      const category = getFoodCategory(item.name, item.description);
      const image = getFoodImage(item.name);
      return {
        menuItem: item,
        recipe: matchedRecipe,
        category,
        image,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItems, recipes, imageVersion]);

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return recipeCards.filter((card) => {
      const matchesSearch =
        card.menuItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (card.menuItem.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || card.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipeCards, searchTerm, selectedCategory]);

  const submitMenuItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = Number(menuPrice);
    if (!menuName.trim() || !Number.isFinite(price) || price < 0) return;
    setBusy(true);
    setError(null);
    try {
      const request: CreateMenuItemRequest = {
        name: menuName.trim(),
        description: menuDescription.trim() || null,
        sellingPrice: price,
      };
      await api.createMenuItem(request);
      setNotice(`Added "${menuName.trim()}" to menu catalog.`);
      setMenuName('');
      setMenuDescription('');
      setMenuPrice('');
      setShowAddMenuModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create menu item.');
    } finally {
      setBusy(false);
    }
  };

  const submitRecipe = async (event: React.FormEvent) => {
    event.preventDefault();
    const ingredientsForRecipe = recipeRows
      .filter((row) => row.ingredientId && Number(row.quantityRequired) > 0)
      .map((row) => ({
        ingredientId: row.ingredientId,
        quantityRequired: Number(row.quantityRequired),
        unit: row.unit.trim() || null,
      }));
    if (!recipeMenuItemId || ingredientsForRecipe.length !== recipeRows.length) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRecipe({
        menuItemId: recipeMenuItemId,
        version: Number(recipeVersion),
        isActive: true,
        ingredients: ingredientsForRecipe,
      });
      setNotice('Recipe created successfully with ingredient quantities.');
      setRecipeRows([{ ingredientId: '', quantityRequired: '', unit: '' }]);
      setShowAddRecipeModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recipe.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPresetImage = (presetSrc: string) => {
    if (!editingImageDish) return;
    saveCustomFoodImage(editingImageDish.name, presetSrc);
    setImageVersion((v) => v + 1);
    setNotice(`Updated photo for "${editingImageDish.name}".`);
    setEditingImageDish(null);
  };

  const handleSaveCustomImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingImageDish || !customImageUrlInput.trim()) return;
    saveCustomFoodImage(editingImageDish.name, customImageUrlInput.trim());
    setImageVersion((v) => v + 1);
    setNotice(`Custom photo applied to "${editingImageDish.name}".`);
    setEditingImageDish(null);
    setCustomImageUrlInput('');
  };

  const handleResetImage = () => {
    if (!editingImageDish) return;
    removeCustomFoodImage(editingImageDish.name);
    setImageVersion((v) => v + 1);
    setNotice(`Reset photo for "${editingImageDish.name}" to default.`);
    setEditingImageDish(null);
  };

  return (
    <div className="view-container">
      {/* ─── Hero Header ────────────────────────────────────────── */}
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Menus &amp; Recipes</h2>
          <p>Manage dishes, ingredient portions, food cost margins, and live stock readiness.</p>
        </div>
        <div className="welcome-actions">
          {canManageMenu && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAddMenuModal(true)}
              >
                <Plus size={15} />
                <span>Add Dish</span>
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowAddRecipeModal(true)}
              >
                <ChefHat size={16} />
                <span>+ Add Recipe</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-icon"
            onClick={() => void loadData()}
            disabled={loading || busy}
            title="Refresh recipes"
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

      {/* ─── Clean Category Tabs & Search Bar ───────────────────── */}
      <div className="menu-filter-bar">
        <div className="menu-category-tabs">
          {categories.map((cat) => {
            const count =
              cat === 'All'
                ? menuItems.length
                : recipeCards.filter((c) => c.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                className={`menu-cat-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <span>{cat}</span>
                <span className="menu-cat-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="search-group" style={{ maxWidth: '300px' }}>
          <div className="input-with-icon search-input">
            <Search size={16} className="input-icon" />
            <input
              type="text"
              placeholder="Search dishes or recipes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ─── Recipe & Menu Cards Grid ───────────────────────────── */}
      {loading ? (
        <div className="table-loading-box">
          <RefreshCw size={24} className="spin text-accent mb-2" />
          <p>Loading dishes and recipes...</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="empty-box">
          <UtensilsCrossed size={36} className="text-muted mb-2" />
          <h4>No dishes match your filter</h4>
          <p className="text-muted text-sm">Try adjusting your search term or category filter.</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {filteredCards.map(({ menuItem, recipe, category, image }) => {
            const ingredientCount = recipe ? recipe.ingredients.length : 0;
            const estimatedCost = (menuItem.sellingPrice * 0.32).toFixed(2);
            return (
              <div className="recipe-card" key={menuItem.id}>
                {/* Food Photography Header */}
                <div
                  className="recipe-card-media"
                  onClick={() => recipe && setSelectedRecipe({ recipe, menuItem })}
                >
                  <img src={image} alt={menuItem.name} className="recipe-card-img" />
                  <span className="recipe-category-tag">{category}</span>
                  <span className="recipe-price-tag">${menuItem.sellingPrice.toFixed(2)}</span>

                  {/* Change Image Action Button */}
                  <button
                    type="button"
                    className="recipe-change-img-btn"
                    title={`Change photo for ${menuItem.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingImageDish({ name: menuItem.name, currentUrl: image });
                      setCustomImageUrlInput(image.startsWith('http') ? image : '');
                    }}
                  >
                    <Camera size={13} />
                    <span>Photo</span>
                  </button>
                </div>

                {/* Recipe Card Body */}
                <div className="recipe-card-body">
                  <div className="recipe-card-title-row">
                    <h3
                      className="recipe-card-title"
                      onClick={() => recipe && setSelectedRecipe({ recipe, menuItem })}
                    >
                      {menuItem.name}
                    </h3>
                    <span
                      className={`badge ${menuItem.isActive ? 'badge-emerald' : 'badge-default'}`}
                    >
                      {menuItem.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>

                  <p className="recipe-card-desc">
                    {menuItem.description || 'Crafted fresh daily with kitchen ingredients.'}
                  </p>

                  {/* Operational Metrics Row */}
                  <div className="recipe-metrics-row">
                    <div className="recipe-metric-item">
                      <span className="recipe-metric-label">Ingredients</span>
                      <strong className="recipe-metric-value">
                        {ingredientCount > 0 ? `${ingredientCount} items` : 'No recipe'}
                      </strong>
                    </div>
                    <div className="recipe-metric-item">
                      <span className="recipe-metric-label">Est. Cost</span>
                      <strong className="recipe-metric-value text-emerald">
                        ${estimatedCost}
                      </strong>
                    </div>
                    <div className="recipe-metric-item">
                      <span className="recipe-metric-label">Portion</span>
                      <strong className="recipe-metric-value">1 Serving</strong>
                    </div>
                  </div>

                  {/* Card Action Button */}
                  <div className="recipe-card-footer">
                    {recipe ? (
                      <button
                        type="button"
                        className="btn-secondary w-full flex items-center justify-center gap-1.5"
                        onClick={() => setSelectedRecipe({ recipe, menuItem })}
                      >
                        <BookOpen size={14} />
                        <span>View Recipe Details</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary w-full flex items-center justify-center gap-1.5"
                        disabled={!canManageMenu}
                        onClick={() => {
                          setRecipeMenuItemId(menuItem.id);
                          setShowAddRecipeModal(true);
                        }}
                      >
                        <Plus size={14} />
                        <span>Build Recipe</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 📸 CHANGE FOOD IMAGE MODAL ─────────────────────────── */}
      {editingImageDish && (
        <div className="modal-overlay" onClick={() => setEditingImageDish(null)}>
          <div className="modal-container modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-accent" />
                <h3 style={{ margin: 0 }}>Choose Photo for "{editingImageDish.name}"</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setEditingImageDish(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Current Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-surface-secondary)', padding: '0.85rem 1rem', borderRadius: '10px' }}>
                <img
                  src={editingImageDish.currentUrl}
                  alt={editingImageDish.name}
                  style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: 'var(--brand-primary)' }}>{editingImageDish.name}</strong>
                  <span className="text-xs text-muted">Click any curated dish photo below or enter a custom URL</span>
                </div>
              </div>

              {/* Curated Presets Grid */}
              <div>
                <span className="section-title" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Curated Culinary Photos
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: '0.65rem', marginTop: '0.5rem' }}>
                  {FOOD_IMAGE_MAP.map((item) => (
                    <div
                      key={item.src + item.label}
                      onClick={() => handleSelectPresetImage(item.src)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        padding: '0.45rem',
                        borderRadius: '8px',
                        border: editingImageDish.currentUrl === item.src ? '2px solid var(--accent-sage)' : '1px solid var(--border)',
                        background: editingImageDish.currentUrl === item.src ? 'var(--accent-mint)' : '#FFFFFF',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <img
                        src={item.src}
                        alt={item.label}
                        style={{ width: '100%', height: '65px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, textAlign: 'center', color: 'var(--text-primary)', lineHeight: 1.15 }}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Image URL Form */}
              <form onSubmit={handleSaveCustomImage} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <span className="section-title" style={{ fontSize: '0.85rem', color: 'var(--brand-primary)' }}>
                  Or Paste Custom Image URL
                </span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/... or cloud image URL"
                    value={customImageUrlInput}
                    onChange={(e) => setCustomImageUrlInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn-primary" disabled={!customImageUrlInput.trim()}>
                    <Check size={14} />
                    <span>Apply</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={handleResetImage}>
                Reset to Default
              </button>
              <button type="button" className="btn-primary" onClick={() => setEditingImageDish(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recipe Detail Drawer / Modal ───────────────────────── */}
      {selectedRecipe && (
        <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
          <div
            className="modal-container modal-lg recipe-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <ChefHat size={20} className="text-accent" />
                <h3 style={{ margin: 0 }}>Recipe Specification</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedRecipe(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="modal-body recipe-detail-layout">
              {/* Left Column: Food Visual & Cost Margin */}
              <div className="recipe-detail-sidebar">
                <div className="recipe-detail-img-wrap">
                  <img
                    src={getFoodImage(selectedRecipe.recipe.menuItemName)}
                    alt={selectedRecipe.recipe.menuItemName}
                    className="recipe-detail-img"
                  />
                  <div className="recipe-detail-badge">
                    {getFoodCategory(selectedRecipe.recipe.menuItemName)}
                  </div>
                  <button
                    type="button"
                    className="recipe-change-img-btn"
                    style={{ position: 'absolute', bottom: '0.65rem', right: '0.65rem' }}
                    onClick={() => {
                      setEditingImageDish({
                        name: selectedRecipe.recipe.menuItemName,
                        currentUrl: getFoodImage(selectedRecipe.recipe.menuItemName),
                      });
                    }}
                  >
                    <Camera size={13} />
                    <span>Change Photo</span>
                  </button>
                </div>

                <div className="recipe-cost-breakdown-card">
                  <h4 className="recipe-subhead">Food Cost &amp; Margin</h4>
                  <div className="cost-row">
                    <span>Menu Selling Price</span>
                    <strong>${(selectedRecipe.menuItem?.sellingPrice ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="cost-row">
                    <span>Est. Ingredient Cost</span>
                    <strong className="text-emerald">
                      ${((selectedRecipe.menuItem?.sellingPrice ?? 10) * 0.32).toFixed(2)}
                    </strong>
                  </div>
                  <div className="cost-row">
                    <span>Target Food Cost %</span>
                    <strong className="text-accent">~32%</strong>
                  </div>
                  <div className="cost-row">
                    <span>Gross Margin</span>
                    <strong className="text-emerald">68%</strong>
                  </div>
                </div>

                <div className="recipe-meta-box">
                  <span className="text-xs text-muted">RECIPE VERSION</span>
                  <strong>v{selectedRecipe.recipe.version}.0 Active</strong>
                </div>
              </div>

              {/* Right Column: Recipe Ingredient Formula */}
              <div className="recipe-detail-main">
                <div className="recipe-title-block">
                  <h2>{selectedRecipe.recipe.menuItemName}</h2>
                  <p className="text-secondary text-sm">
                    {selectedRecipe.menuItem?.description || 'Standard kitchen preparation formula.'}
                  </p>
                </div>

                <div className="recipe-ingredients-section">
                  <div className="section-header-row mb-2">
                    <h4 className="recipe-subhead">
                      Required Ingredients ({selectedRecipe.recipe.ingredients.length})
                    </h4>
                    <span className="text-xs text-muted">Formula per 1 portion</span>
                  </div>

                  <div className="table-responsive-wrapper">
                    <table className="custom-table recipe-formula-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th>Portion Required</th>
                          <th>Live Pantry Stock</th>
                          <th>Readiness</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRecipe.recipe.ingredients.map((ing) => {
                          const stock = stockMap.get(ing.ingredientId);
                          const currentStock = stock?.currentStock ?? 0;
                          const isAvailable = currentStock >= ing.quantityRequired;

                          return (
                            <tr key={ing.id || ing.ingredientId}>
                              <td>
                                <strong>{ing.ingredientName}</strong>
                              </td>
                              <td>
                                <span className="font-mono font-bold">
                                  {formatQuantity(ing.quantityRequired)} {ing.unit || 'units'}
                                </span>
                              </td>
                              <td>
                                <span className="text-secondary">
                                  {currentStock > 0 ? (
                                    <>
                                      {formatQuantity(currentStock)} {stock?.unit || ing.unit}
                                    </>
                                  ) : (
                                    <span className="text-rose font-medium">Out of stock</span>
                                  )}
                                </span>
                              </td>
                              <td>
                                {isAvailable ? (
                                  <span className="badge badge-emerald">
                                    <CheckCircle2 size={12} /> Ready
                                  </span>
                                ) : (
                                  <span className="badge badge-rose">
                                    <AlertTriangle size={12} /> Low Stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* FEFO Preparation Rule */}
                <div className="fefo-kitchen-notice">
                  <div className="fefo-notice-icon">
                    <Layers size={18} className="text-accent" />
                  </div>
                  <div>
                    <strong>FEFO Kitchen Fulfillment</strong>
                    <p className="text-xs text-secondary">
                      When this dish is ordered at POS, the system automatically allocates and deducts the oldest expiring ingredient batches first.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRecipe(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD MENU ITEM MODAL ─────────────────────────────────── */}
      {showAddMenuModal && (
        <div className="modal-overlay" onClick={() => setShowAddMenuModal(false)}>
          <div className="modal-container modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <UtensilsCrossed size={18} className="text-accent" />
                <h3 style={{ margin: 0 }}>Add Menu Dish</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowAddMenuModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitMenuItem}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Dish Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Molten Chocolate Lava Cake, Crispy Fried Green Beans"
                    value={menuName}
                    onChange={(e) => setMenuName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of dish, preparation notes, or allergens..."
                    value={menuDescription}
                    onChange={(e) => setMenuDescription(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Selling Price ($)</label>
                  <div className="input-with-icon">
                    <DollarSign size={16} className="input-icon" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={menuPrice}
                      onChange={(e) => setMenuPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddMenuModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={busy || !menuName.trim()}>
                  <CheckCircle2 size={15} />
                  <span>Create Dish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── ADD RECIPE FORMULA MODAL ────────────────────────────── */}
      {showAddRecipeModal && (
        <div className="modal-overlay" onClick={() => setShowAddRecipeModal(false)}>
          <div className="modal-container modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <ChefHat size={18} className="text-accent" />
                <h3 style={{ margin: 0 }}>Create Recipe Formula</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowAddRecipeModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitRecipe}>
              <div className="modal-body">
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Menu Dish</label>
                    <select
                      value={recipeMenuItemId}
                      onChange={(e) => setRecipeMenuItemId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Dish --</option>
                      {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (${item.sellingPrice.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Recipe Version</label>
                    <input
                      type="number"
                      min="1"
                      value={recipeVersion}
                      onChange={(e) => setRecipeVersion(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="section-header-row mb-2">
                    <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      Ingredients per 1 Portion
                    </label>
                    <span className="text-xs text-muted">Deducted on every order</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {recipeRows.map((row, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: 'var(--bg-surface-secondary)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ flex: 3 }}>
                          <select
                            value={row.ingredientId}
                            onChange={(e) => handleIngredientSelect(index, e.target.value)}
                            required
                          >
                            <option value="">-- Select Ingredient --</option>
                            {ingredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.sku})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: 2 }}>
                          <input
                            type="number"
                            step="0.001"
                            min="0.0001"
                            placeholder="Qty required"
                            value={row.quantityRequired}
                            onChange={(e) =>
                              setRecipeRows((rows) =>
                                rows.map((r, i) =>
                                  i === index ? { ...r, quantityRequired: e.target.value } : r
                                )
                              )
                            }
                            required
                          />
                        </div>
                        <div style={{ flex: 1.5 }}>
                          <input
                            type="text"
                            placeholder="Unit"
                            value={row.unit}
                            onChange={(e) =>
                              setRecipeRows((rows) =>
                                rows.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r))
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() =>
                            setRecipeRows((rows) => rows.filter((_, i) => i !== index))
                          }
                          disabled={recipeRows.length === 1}
                          title="Remove row"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn-secondary btn-sm mt-3"
                    onClick={() =>
                      setRecipeRows((rows) => [
                        ...rows,
                        { ingredientId: '', quantityRequired: '', unit: '' },
                      ])
                    }
                  >
                    <Plus size={14} />
                    <span>Add Another Ingredient</span>
                  </button>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddRecipeModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !recipeMenuItemId}
                >
                  <CheckCircle2 size={15} />
                  <span>Save Recipe</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
