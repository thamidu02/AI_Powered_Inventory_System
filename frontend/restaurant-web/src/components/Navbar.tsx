import React, { useState } from 'react';
import {
  Boxes,
  Layers,
  LogOut,
  ShieldCheck,
  Sliders,
  ReceiptText,
  UtensilsCrossed,
  Truck,
  ShoppingCart,
  Sparkles,
  BarChart3,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { TEST_ACCOUNTS } from '../types';

export interface NavbarProps {
  activeTab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning';
  setActiveTab: (tab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning') => void;
}

export const SavoryLogo: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect width="32" height="32" rx="8" fill="#173F35" />
    <circle cx="8" cy="8.5" r="1.5" fill="#E7F1EB" fillOpacity="0.6" />
    <circle cx="8" cy="16" r="1.5" fill="#E7F1EB" />
    <circle cx="8" cy="23.5" r="1.5" fill="#E7F1EB" fillOpacity="0.6" />
    <path
      d="M23.5 8.5C18.5 8.5 14.5 12 14.5 16.5C14.5 20.5 19 20.5 19 23.5C19 25.5 17.5 26.5 15 26C13.2 25.6 12 24.2 12 24.2"
      stroke="#E7F1EB"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M23.5 8.5C23.5 13 20 16 15 16C15 12 18 8.5 23.5 8.5Z"
      fill="#4F8A70"
    />
    <circle cx="20.5" cy="11.5" r="1.2" fill="#FFFFFF" />
  </svg>
);

export const getRoleBadgeClass = (role?: string) => {
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

interface SidebarProps {
  activeTab: NavbarProps['activeTab'];
  setActiveTab: NavbarProps['setActiveTab'];
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  setMobileOpen,
}) => {
  const { user } = useAuth();

  const handleNavClick = (tab: NavbarProps['activeTab']) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  const isKitchenStaff = ['SALES_KITCHEN_STAFF', 'RESTAURANT_MANAGER', 'SYSTEM_ADMIN'].includes(user?.role ?? '');
  const isInventoryManager = user?.role === 'INVENTORY_MANAGER' || user?.role === 'SYSTEM_ADMIN' || user?.role === 'RESTAURANT_MANAGER';

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Practical Restaurant Sidebar */}
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <div className="brand-logo-container">
            <SavoryLogo size={34} />
          </div>
          <div className="brand-info">
            <h1 className="brand-title">
              Savory<span>Inventory</span>
            </h1>
            <p className="brand-subtitle">Restaurant Operations &amp; Traceability</p>
          </div>
          <button
            type="button"
            className="mobile-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Categories */}
        <div className="sidebar-scrollable">
          {/* Group 1: Overview */}
          <div className="nav-section">
            <div className="nav-section-title">OVERVIEW</div>
            <nav className="nav-group">
              <button
                type="button"
                data-guide-id="nav-inventory"
                className={`sidebar-nav-item ${activeTab === 'inventory' ? 'active' : ''}`}
                onClick={() => handleNavClick('inventory')}
              >
                <Boxes size={18} className="nav-icon" />
                <span className="nav-label">Dashboard &amp; Stock</span>
                {activeTab === 'inventory' && <span className="active-pill" />}
              </button>

              <button
                type="button"
                data-guide-id="nav-operations"
                className={`sidebar-nav-item ${activeTab === 'operations' ? 'active' : ''}`}
                onClick={() => handleNavClick('operations')}
              >
                <Sliders size={18} className="nav-icon" />
                <span className="nav-label">Daily Operations</span>
                {activeTab === 'operations' && <span className="active-pill" />}
              </button>
            </nav>
          </div>

          {/* Group 2: Manage */}
          <div className="nav-section">
            <div className="nav-section-title">MANAGE</div>
            <nav className="nav-group">
              <button
                type="button"
                data-guide-id="nav-recipes"
                className={`sidebar-nav-item ${activeTab === 'menuRecipes' ? 'active' : ''}`}
                onClick={() => handleNavClick('menuRecipes')}
              >
                <UtensilsCrossed size={18} className="nav-icon" />
                <span className="nav-label">Menus &amp; Recipes</span>
                {activeTab === 'menuRecipes' && <span className="active-pill" />}
              </button>

              <button
                type="button"
                data-guide-id="nav-sales-waste"
                className={`sidebar-nav-item ${activeTab === 'salesWaste' ? 'active' : ''}`}
                onClick={() => handleNavClick('salesWaste')}
              >
                <ReceiptText size={18} className="nav-icon" />
                <span className="nav-label">Sales &amp; Waste</span>
                {activeTab === 'salesWaste' && <span className="active-pill" />}
              </button>

              <button
                type="button"
                data-guide-id="nav-master-data"
                className={`sidebar-nav-item ${activeTab === 'masterData' ? 'active' : ''}`}
                onClick={() => handleNavClick('masterData')}
              >
                <Layers size={18} className="nav-icon" />
                <span className="nav-label">Ingredient Catalog</span>
                {activeTab === 'masterData' && <span className="active-pill" />}
              </button>

              {isKitchenStaff && (
                <button
                  type="button"
                  id="nav-kitchen-order"
                  data-guide-id="nav-kitchen-orders"
                  className={`sidebar-nav-item ${activeTab === 'kitchenOrder' ? 'active' : ''}`}
                  onClick={() => handleNavClick('kitchenOrder')}
                >
                  <ShoppingCart size={18} className="nav-icon" />
                  <span className="nav-label">Kitchen Orders (POS)</span>
                  {activeTab === 'kitchenOrder' && <span className="active-pill" />}
                </button>
              )}
            </nav>
          </div>

          {/* Group 3: Supply */}
          <div className="nav-section">
            <div className="nav-section-title">SUPPLY</div>
            <nav className="nav-group">
              <button
                type="button"
                data-guide-id="nav-procurement"
                className={`sidebar-nav-item ${activeTab === 'procurement' ? 'active' : ''}`}
                onClick={() => handleNavClick('procurement')}
              >
                <Truck size={18} className="nav-icon" />
                <span className="nav-label">Supply &amp; Orders</span>
                {activeTab === 'procurement' && <span className="active-pill" />}
              </button>

              <button
                type="button"
                data-guide-id="nav-planning"
                className={`sidebar-nav-item ${activeTab === 'planning' ? 'active' : ''}`}
                onClick={() => handleNavClick('planning')}
              >
                <BarChart3 size={18} className="nav-icon" />
                <span className="nav-label">Demand Planning</span>
                {activeTab === 'planning' && <span className="active-pill" />}
              </button>
            </nav>
          </div>

          {/* Group 4: Assistant */}
          {isInventoryManager && (
            <div className="nav-section">
              <div className="nav-section-title">ASSISTANT</div>
              <nav className="nav-group">
                <button
                  type="button"
                  id="nav-ai-assistant"
                  data-guide-id="nav-ai-assistant"
                  className={`sidebar-nav-item nav-item--assistant ${activeTab === 'aiAssistant' ? 'active' : ''}`}
                  onClick={() => handleNavClick('aiAssistant')}
                >
                  <Sparkles size={17} className="nav-icon text-accent" />
                  <span className="nav-label">Savory Assistant</span>
                  {activeTab === 'aiAssistant' && <span className="active-pill" />}
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Sidebar Footer FEFO Protocol Status */}
        <div className="sidebar-footer">
          <div className="fefo-status-badge">
            <div className="status-indicator-dot" />
            <div className="status-text-block">
              <span className="status-title">FEFO Active</span>
              <span className="status-desc">Use oldest stock first</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

interface TopHeaderProps {
  activeTab: NavbarProps['activeTab'];
  onOpenMobileNav: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onOpenMobileNav,
}) => {
  const { user, logout, quickLogin, loading } = useAuth();

  const getTabLabel = (tab: NavbarProps['activeTab']) => {
    switch (tab) {
      case 'inventory':
        return 'Dashboard & Stock';
      case 'operations':
        return 'Daily Operations';
      case 'masterData':
        return 'Ingredient Catalog';
      case 'menuRecipes':
        return 'Menus & Recipes';
      case 'salesWaste':
        return 'Sales & Waste';
      case 'procurement':
        return 'Supply & Orders';
      case 'planning':
        return 'Demand Planning';
      case 'kitchenOrder':
        return 'Kitchen Orders (POS)';
      case 'aiAssistant':
        return 'Savory Assistant';
      default:
        return 'Overview';
    }
  };

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-burger-btn"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <div className="topbar-breadcrumb">
          <span className="breadcrumb-root">SavoryInventory</span>
          <ChevronRight size={14} className="breadcrumb-separator" />
          <span className="breadcrumb-current">{getTabLabel(activeTab)}</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Fast Role Switcher Pill */}
        <div className="role-switcher">
          <span className="switcher-label">ROLE:</span>
          <div className="role-chips">
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.role}
                type="button"
                className={`role-chip ${user?.role === acc.role ? 'active' : ''}`}
                onClick={() => quickLogin(acc.email)}
                disabled={loading}
                title={`Switch role to ${acc.name} (${acc.role})`}
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
            <span className={`role-badge ${getRoleBadgeClass(user?.role)}`}>
              <ShieldCheck size={11} className="inline-icon" />
              {user?.role?.replace(/_/g, ' ') || 'USER'}
            </span>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={logout}
            title="Log out of current session"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <TopHeader
        activeTab={activeTab}
        onOpenMobileNav={() => setMobileOpen(true)}
      />
    </>
  );
};
