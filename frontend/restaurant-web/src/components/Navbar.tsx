import React from 'react';
import {
  Boxes,
  Layers,
  LogOut,
  ShieldCheck,
  Sliders,
  ReceiptText,
  UtensilsCrossed,
  Utensils,
  Truck,
  ShoppingCart,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { TEST_ACCOUNTS } from '../types';

interface NavbarProps {
  activeTab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning';
  setActiveTab: (tab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning') => void;
}

const getRoleBadgeColor = (role?: string) => {
  switch (role) {
    case 'SYSTEM_ADMIN':
      return 'badge-purple';
    case 'RESTAURANT_MANAGER':
      return 'badge-blue';
    case 'INVENTORY_MANAGER':
      return 'badge-emerald';
    case 'PROCUREMENT_OFFICER':
      return 'badge-amber';
    case 'SALES_KITCHEN_STAFF':
      return 'badge-rose';
    default:
      return 'badge-default';
  }
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, logout, quickLogin, loading } = useAuth();

  return (
    <header className="navbar-container">
      <div className="navbar-top">
        <div className="brand-group">
          <div className="brand-icon">
            <Utensils size={22} />
          </div>
          <div>
            <div className="brand-title">
              Savory<span>Inventory</span>
            </div>
            <div className="brand-subtitle">AI-Assisted Operations & FEFO Traceability</div>
          </div>
        </div>

        {/* Fast Role Switcher Pill */}
        <div className="role-switcher">
          <span className="switcher-label">Switch Role:</span>
          <div className="role-chips">
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                type="button"
                className={`role-chip ${user?.role === acc.role ? 'active' : ''}`}
                onClick={() => quickLogin(acc.email)}
                disabled={loading}
                title={`Switch to ${acc.name} (${acc.role})`}
              >
                {acc.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="user-profile">
          <div className="user-details">
            <span className="user-name">{user?.fullName || 'Active User'}</span>
            <span className={`role-badge ${getRoleBadgeColor(user?.role)}`}>
              <ShieldCheck size={12} className="inline-icon" />
              {user?.role?.replace('_', ' ') || 'USER'}
            </span>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={logout}
            title="Log out of current session"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="navbar-tabs">
        <button
          type="button"
          data-guide-id="nav-inventory"
          className={`nav-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <Boxes size={18} />
          <span>Stock & Batches</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-operations"
          className={`nav-tab ${activeTab === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveTab('operations')}
        >
          <Sliders size={18} />
          <span>Operations Hub</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-master-data"
          className={`nav-tab ${activeTab === 'masterData' ? 'active' : ''}`}
          onClick={() => setActiveTab('masterData')}
        >
          <Layers size={18} />
          <span>Master Catalog</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-recipes"
          className={`nav-tab ${activeTab === 'menuRecipes' ? 'active' : ''}`}
          onClick={() => setActiveTab('menuRecipes')}
        >
          <UtensilsCrossed size={18} />
          <span>Menus & Recipes</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-sales-waste"
          className={`nav-tab ${activeTab === 'salesWaste' ? 'active' : ''}`}
          onClick={() => setActiveTab('salesWaste')}
        >
          <ReceiptText size={18} />
          <span>Sales & Waste</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-procurement"
          className={`nav-tab ${activeTab === 'procurement' ? 'active' : ''}`}
          onClick={() => setActiveTab('procurement')}
        >
          <Truck size={18} />
          <span>Procurement &amp; Suppliers</span>
        </button>

        <button
          type="button"
          data-guide-id="nav-planning"
          className={`nav-tab ${activeTab === 'planning' ? 'active' : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          <BarChart3 size={18} />
          <span>Demand &amp; Planning</span>
        </button>

        {(['SALES_KITCHEN_STAFF', 'RESTAURANT_MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '')) && (
          <button
            type="button"
            id="nav-kitchen-order"
            data-guide-id="nav-kitchen-orders"
            className={`nav-tab nav-tab--highlight ${activeTab === 'kitchenOrder' ? 'active' : ''}`}
            onClick={() => setActiveTab('kitchenOrder')}
          >
            <ShoppingCart size={18} />
            <span>Kitchen Orders</span>
          </button>
        )}

        {user?.role === 'INVENTORY_MANAGER' && (
          <button
            type="button"
            id="nav-ai-assistant"
            data-guide-id="nav-ai-assistant"
            className={`nav-tab nav-tab--ai ${activeTab === 'aiAssistant' ? 'active' : ''}`}
            onClick={() => setActiveTab('aiAssistant')}
          >
            <Sparkles size={18} />
            <span>AI Assistant</span>
          </button>
        )}
      </nav>
    </header>
  );
};
