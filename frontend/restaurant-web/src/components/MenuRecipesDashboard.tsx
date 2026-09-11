import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/useAuth';
import type {
  CreateMenuItemRequest,
  IngredientResponse,
  MenuItemResponse,
  RecipeResponse,
} from '../types';

const formatQuantity = (quantity: number) =>
  Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

export const MenuRecipesDashboard: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItemResponse[]>([]);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [ingredients, setIngredients] = useState<IngredientResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuName, setMenuName] = useState('');
  const [menuDescription, setMenuDescription] = useState('');
  const [menuPrice, setMenuPrice] = useState('');
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeVersion, setRecipeVersion] = useState('1');
  const [recipeRows, setRecipeRows] = useState([
    { ingredientId: '', quantityRequired: '', unit: '' },
  ]);

  const canManageMenu = ['SYSTEM_ADMIN', 'RESTAURANT_MANAGER'].includes(user?.role ?? '');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menu, recipeData, ingredientData] = await Promise.all([
        api.getMenuItems(),
        api.getRecipes(),
        api.getIngredients(),
      ]);
      setMenuItems(menu);
      setRecipes(recipeData);
      setIngredients(ingredientData);
      setRecipeMenuItemId((current) => current || menu.find((item) => item.isActive)?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menus and recipes.');
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
      setNotice('Menu item created.');
      setMenuName('');
      setMenuDescription('');
      setMenuPrice('');
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
      setNotice('Recipe created with its ingredient quantities.');
      setRecipeRows([{ ingredientId: '', quantityRequired: '', unit: '' }]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recipe.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view-container">
      <div className="hub-hero">
        <div className="hub-hero-text">
          <h2>Menu & Recipes</h2>
          <p>Manage menu pricing and define the recipe quantities used by sales consumption.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadData()} disabled={loading || busy}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="alert-error"><AlertCircle size={18} />{error}</div>}
      {notice && <div className="alert-success"><CheckCircle2 size={18} />{notice}</div>}

      <section className="table-card dashboard-panel menu-recipe-section">
        <div className="panel-heading">
          <div>
            <h3><UtensilsCrossed size={18} className="inline-icon" /> Menu catalogue</h3>
            <p className="text-sm text-muted">Menu items provide the server-side selling price used when recording sales.</p>
          </div>
          <span className="badge badge-purple">{menuItems.length} menu items</span>
        </div>
        <div className="dashboard-two-column">
          <div className="dashboard-list">
            {menuItems.map((item) => (
              <div className="dashboard-list-row" key={item.id}>
                <div><strong>{item.name}</strong><span className="text-xs text-muted">{item.description || 'No description'} · {item.recipeCount} recipe(s)</span></div>
                <div className="menu-price-status"><strong className="text-emerald">${item.sellingPrice.toFixed(2)}</strong><span className={`badge ${item.isActive ? 'badge-emerald' : 'badge-default'}`}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>
              </div>
            ))}
            {menuItems.length === 0 && <p className="empty-state">No menu items configured yet.</p>}
          </div>
          <form className="stack-form" onSubmit={submitMenuItem}>
            <h4 className="subsection-title">Create menu item</h4>
            <label>Name<input value={menuName} onChange={(event) => setMenuName(event.target.value)} maxLength={200} disabled={!canManageMenu} required /></label>
            <label>Description<textarea value={menuDescription} onChange={(event) => setMenuDescription(event.target.value)} maxLength={1000} disabled={!canManageMenu} rows={2} /></label>
            <label>Selling price<input type="number" min="0" step="0.01" value={menuPrice} onChange={(event) => setMenuPrice(event.target.value)} disabled={!canManageMenu} required /></label>
            <button className="btn-primary" type="submit" disabled={!canManageMenu || busy}><Plus size={16} />Create menu item</button>
            {!canManageMenu && <span className="text-xs text-rose">Only managers and system administrators can manage menu items.</span>}
          </form>
        </div>
      </section>

      <section className="table-card dashboard-panel menu-recipe-section">
        <div className="panel-heading"><div><h3>Recipe builder</h3><p className="text-sm text-muted">Each ingredient is stored with its required quantity and unit.</p></div><span className="badge badge-emerald">{recipes.length} recipes</span></div>
        <form className="stack-form" onSubmit={submitRecipe}>
          <div className="recipe-header-fields">
            <label>Menu item<select value={recipeMenuItemId} onChange={(event) => setRecipeMenuItemId(event.target.value)} disabled={!canManageMenu} required><option value="">Select menu item</option>{menuItems.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Version<input type="number" min="1" step="1" value={recipeVersion} onChange={(event) => setRecipeVersion(event.target.value)} disabled={!canManageMenu} /></label>
          </div>
          {recipeRows.map((row, index) => (
            <div className="recipe-ingredient-row" key={index}>
              <select value={row.ingredientId} onChange={(event) => setRecipeRows((rows) => rows.map((current, rowIndex) => rowIndex === index ? { ...current, ingredientId: event.target.value } : current))} disabled={!canManageMenu} required>
                <option value="">Ingredient</option>
                {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
              </select>
              <input type="number" min="0.000001" step="0.001" placeholder="Quantity" value={row.quantityRequired} onChange={(event) => setRecipeRows((rows) => rows.map((current, rowIndex) => rowIndex === index ? { ...current, quantityRequired: event.target.value } : current))} disabled={!canManageMenu} required />
              <input placeholder="Unit" value={row.unit} onChange={(event) => setRecipeRows((rows) => rows.map((current, rowIndex) => rowIndex === index ? { ...current, unit: event.target.value } : current))} disabled={!canManageMenu} maxLength={50} />
              <button type="button" className="btn-icon" onClick={() => setRecipeRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={!canManageMenu || recipeRows.length === 1} aria-label="Remove ingredient">−</button>
            </div>
          ))}
          <div className="recipe-actions">
            <button type="button" className="btn-secondary" onClick={() => setRecipeRows((rows) => [...rows, { ingredientId: '', quantityRequired: '', unit: '' }])} disabled={!canManageMenu}><Plus size={16} />Add ingredient</button>
            <button className="btn-primary" type="submit" disabled={!canManageMenu || busy}><CheckCircle2 size={16} />Create recipe</button>
          </div>
        </form>
      </section>

      <section className="table-card dashboard-panel menu-recipe-section">
        <div className="panel-heading"><h3>Recipe coverage</h3><span className="text-sm text-muted">Backend-linked ingredient quantities</span></div>
        <div className="dashboard-list">{recipes.map((recipe) => <div className="dashboard-list-row" key={recipe.id}><div><strong>{recipe.menuItemName}</strong><span className="text-xs text-muted">v{recipe.version} · {recipe.ingredients.map((ingredient) => `${ingredient.ingredientName} ${formatQuantity(ingredient.quantityRequired)}${ingredient.unit}`).join(', ')}</span></div><span className={`badge ${recipe.isActive ? 'badge-emerald' : 'badge-default'}`}>{recipe.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>)}{recipes.length === 0 && <p className="empty-state">No recipes configured yet.</p>}</div>
      </section>
    </div>
  );
};
