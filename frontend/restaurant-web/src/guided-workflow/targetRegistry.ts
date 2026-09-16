export interface TargetInfo {
  targetId: string;
  name: string;
  tab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning';
  route: string;
  description: string;
}

export const TARGET_REGISTRY: Record<string, TargetInfo> = {
  // Navigation tabs
  'nav-inventory': {
    targetId: 'nav-inventory',
    name: 'Stock & Batches Tab',
    tab: 'inventory',
    route: '/inventory',
    description: 'Main navigation tab for inventory and batch tracking',
  },
  'nav-operations': {
    targetId: 'nav-operations',
    name: 'Operations Hub Tab',
    tab: 'operations',
    route: '/operations',
    description: 'Main navigation tab for stock operation actions',
  },
  'nav-master-data': {
    targetId: 'nav-master-data',
    name: 'Master Catalog Tab',
    tab: 'masterData',
    route: '/master-data',
    description: 'Navigation tab for ingredients and storage locations master data',
  },
  'nav-sales-waste': {
    targetId: 'nav-sales-waste',
    name: 'Sales & Waste Tab',
    tab: 'salesWaste',
    route: '/sales-waste',
    description: 'Navigation tab for tracking POS sales logs and waste records',
  },
  'nav-procurement': {
    targetId: 'nav-procurement',
    name: 'Procurement Tab',
    tab: 'procurement',
    route: '/procurement',
    description: 'Navigation tab for purchase requests and supplier management',
  },
  'nav-planning': {
    targetId: 'nav-planning',
    name: 'Demand Planning Tab',
    tab: 'planning',
    route: '/planning',
    description: 'Navigation tab for inventory forecasting and reorder planning',
  },
  'nav-ai-assistant': {
    targetId: 'nav-ai-assistant',
    name: 'AI Assistant Tab',
    tab: 'aiAssistant',
    route: '/ai-assistant',
    description: 'Navigation tab for the Agentic AI assistant',
  },

  // Action buttons
  'receive-stock-button': {
    targetId: 'receive-stock-button',
    name: 'Receive Stock Button',
    tab: 'inventory',
    route: '/inventory',
    description: 'Triggers the stock intake modal form',
  },
  'consume-stock-button': {
    targetId: 'consume-stock-button',
    name: 'Consume Stock (FEFO) Button',
    tab: 'inventory',
    route: '/inventory',
    description: 'Triggers the FEFO consumption modal form',
  },
  'record-waste-button': {
    targetId: 'record-waste-button',
    name: 'Record Waste Button',
    tab: 'salesWaste',
    route: '/sales-waste',
    description: 'Triggers the waste logging dialog',
  },
  'low-stock-alert-card': {
    targetId: 'low-stock-alert-card',
    name: 'Stock Alerts KPI Card',
    tab: 'inventory',
    route: '/inventory',
    description: 'Summary card highlighting depleted and low safety stock items',
  },

  // Receive stock form fields
  'receive-ingredient-select': {
    targetId: 'receive-ingredient-select',
    name: 'Ingredient Selector',
    tab: 'inventory',
    route: '/inventory',
    description: 'Dropdown to pick ingredient being received',
  },
  'receive-location-select': {
    targetId: 'receive-location-select',
    name: 'Storage Location Selector',
    tab: 'inventory',
    route: '/inventory',
    description: 'Dropdown to pick destination storage room/cooler',
  },
  'receive-batch-input': {
    targetId: 'receive-batch-input',
    name: 'Batch / Lot Number Input',
    tab: 'inventory',
    route: '/inventory',
    description: 'Input for supplier lot or tracking number',
  },
  'receive-quantity-input': {
    targetId: 'receive-quantity-input',
    name: 'Quantity Input',
    tab: 'inventory',
    route: '/inventory',
    description: 'Numeric input for received quantity',
  },
  'receive-unit-cost-input': {
    targetId: 'receive-unit-cost-input',
    name: 'Unit Cost Input',
    tab: 'inventory',
    route: '/inventory',
    description: 'Numeric input for per-unit cost in USD',
  },
  'receive-expiry-input': {
    targetId: 'receive-expiry-input',
    name: 'Expiry Date Picker',
    tab: 'inventory',
    route: '/inventory',
    description: 'Date picker for batch expiration date',
  },
  'receive-submit-button': {
    targetId: 'receive-submit-button',
    name: 'Confirm Intake Button',
    tab: 'inventory',
    route: '/inventory',
    description: 'Form submit button to commit batch intake',
  },

  // Consume stock form fields
  'consume-ingredient-select': {
    targetId: 'consume-ingredient-select',
    name: 'Consume Ingredient Selector',
    tab: 'inventory',
    route: '/inventory',
    description: 'Dropdown to choose ingredient to consume',
  },
  'consume-quantity-input': {
    targetId: 'consume-quantity-input',
    name: 'Consume Quantity Input',
    tab: 'inventory',
    route: '/inventory',
    description: 'Numeric input for consumption quantity',
  },
  'consume-submit-button': {
    targetId: 'consume-submit-button',
    name: 'Confirm Consumption Button',
    tab: 'inventory',
    route: '/inventory',
    description: 'Button to finalize FEFO stock consumption',
  },

  // Waste form fields
  'waste-ingredient-select': {
    targetId: 'waste-ingredient-select',
    name: 'Waste Ingredient Selector',
    tab: 'salesWaste',
    route: '/sales-waste',
    description: 'Dropdown for wasted ingredient',
  },
  'waste-quantity-input': {
    targetId: 'waste-quantity-input',
    name: 'Waste Quantity Input',
    tab: 'salesWaste',
    route: '/sales-waste',
    description: 'Quantity wasted',
  },
  'waste-submit-button': {
    targetId: 'waste-submit-button',
    name: 'Confirm Waste Button',
    tab: 'salesWaste',
    route: '/sales-waste',
    description: 'Submit button for logging waste',
  },
};

export const isAllowedTarget = (targetId: string): boolean => {
  return targetId in TARGET_REGISTRY;
};
