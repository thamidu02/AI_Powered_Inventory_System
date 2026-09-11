// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  expiresAt: string;
}

export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'RESTAURANT_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'PROCUREMENT_OFFICER'
  | 'SALES_KITCHEN_STAFF';

export const TEST_ACCOUNTS: { email: string; role: UserRole; name: string; description: string }[] = [
  {
    email: 'admin@restaurant.com',
    role: 'SYSTEM_ADMIN',
    name: 'System Admin',
    description: 'Full system management & master data CRUD',
  },
  {
    email: 'manager@restaurant.com',
    role: 'RESTAURANT_MANAGER',
    name: 'Restaurant Manager',
    description: 'Decision maker, approves large stock adjustments',
  },
  {
    email: 'inventory@restaurant.com',
    role: 'INVENTORY_MANAGER',
    name: 'Inventory Manager',
    description: 'Warehouse operations, receives, transfers, adjusts',
  },
  {
    email: 'procurement@restaurant.com',
    role: 'PROCUREMENT_OFFICER',
    name: 'Procurement Officer',
    description: 'Monitors inventory levels & reorder needs',
  },
  {
    email: 'staff@restaurant.com',
    role: 'SALES_KITCHEN_STAFF',
    name: 'Kitchen Staff',
    description: 'Consumes stock (FEFO) & records waste',
  },
];

// Inventory & Batches
export interface StockBatchResponse {
  id: string;
  ingredientId: string;
  ingredientName: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  receivedDate: string;
  expiryDate?: string | null;
  status: string; // AVAILABLE, PARTIALLY_USED, DEPLETED
  storageLocationId: string;
  storageLocationName: string;
}

export interface InventoryResponse {
  ingredientId: string;
  ingredientName: string;
  sku: string;
  unit: string;
  currentStock: number;
  minimumStockLevel: number;
  maximumStockLevel: number;
  isLowStock: boolean;
  batches: StockBatchResponse[];
}

// Master Data: Ingredient
export interface IngredientResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  sku: string;
  unit: string;
  minimumStockLevel: number;
  maximumStockLevel: number;
}

export interface CreateIngredientRequest {
  categoryId: string;
  name: string;
  sku: string;
  unit: string;
  minimumStockLevel: number;
  maximumStockLevel: number;
}

export interface UpdateIngredientRequest {
  categoryId: string;
  name: string;
  sku: string;
  unit: string;
  minimumStockLevel: number;
  maximumStockLevel: number;
}

// Master Data: Category
export interface CategoryResponse {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name: string;
  description?: string;
}

// Master Data: Storage Location
export interface StorageLocationResponse {
  id: string;
  name: string;
  description?: string | null;
  temperatureType?: string | null; // REFRIGERATED, FROZEN, AMBIENT
  isActive: boolean;
}

export interface CreateStorageLocationRequest {
  name: string;
  description?: string;
  temperatureType?: string;
}

export interface UpdateStorageLocationRequest {
  name: string;
  description?: string;
  temperatureType?: string;
  isActive: boolean;
}

// Stock Operations Requests
export interface ReceiveStockRequest {
  ingredientId: string;
  storageLocationId: string;
  goodsReceiptId?: string | null;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  expiryDate?: string | null;
}

export interface ConsumeStockRequest {
  ingredientId: string;
  quantity: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
}

export interface RecordWasteRequest {
  stockBatchId: string;
  quantity: number;
  reason: string;
  referenceId?: string | null;
}

export interface AdjustStockRequest {
  stockBatchId: string;
  quantityChange: number; // positive or negative
  reason: string;
}

export interface TransferStockRequest {
  stockBatchId: string;
  destinationStorageLocationId: string;
  quantity: number;
}

export interface StockAdjustmentResponse {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockBatchId: string;
  batchNumber: string;
  quantityChange: number;
  reason: string;
  status: string;
  requestedById: string;
  requestedByName: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

// Operation Modals State
export type ActiveModal =
  | null
  | { type: 'receive'; ingredientId?: string }
  | {
      type: 'consume';
      ingredientId?: string;
      ingredientName?: string;
      unit?: string;
      sku?: string;
      currentStock?: number;
    }
  | { type: 'waste'; batch?: StockBatchResponse; ingredientName?: string }
  | { type: 'adjust'; batch?: StockBatchResponse; ingredientName?: string }
  | { type: 'transfer'; batch?: StockBatchResponse; ingredientName?: string }
  | { type: 'createIngredient' }
  | { type: 'createCategory' }
  | { type: 'createLocation' }
  | { type: 'approveAdjustment'; adjustmentId: string; adjustment?: StockAdjustmentResponse };

// Sales, recipes, and waste
export interface MenuItemResponse {
  id: string;
  name: string;
  description?: string | null;
  sellingPrice: number;
  isActive: boolean;
  recipeCount: number;
}

export interface RecipeIngredientResponse {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantityRequired: number;
}

export interface RecipeResponse {
  id: string;
  menuItemId: string;
  menuItemName: string;
  version: number;
  isActive: boolean;
  ingredients: RecipeIngredientResponse[];
}

export interface SaleItemResponse {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SaleResponse {
  id: string;
  recordedById: string;
  recordedByName: string;
  saleDate: string;
  totalAmount: number;
  status: string;
  items: SaleItemResponse[];
}

export interface SalesSummaryResponse {
  totalSales: number;
  totalRevenue: number;
  averageOrderValue: number;
  totalItemsSold: number;
  from?: string | null;
  to?: string | null;
}

export interface WasteRecordResponse {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockBatchId: string;
  stockBatchNumber: string;
  quantity: number;
  reason: string;
  reportedById: string;
  reportedByName: string;
  status: string;
  recordedAt: string;
  confirmedById?: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
}

export interface WasteSummaryResponse {
  totalWasteRecords: number;
  totalWasteQuantity: number;
  from?: string | null;
  to?: string | null;
}

export interface CreateSaleRequest {
  items: { menuItemId: string; quantity: number }[];
}

export interface CreateMenuItemRequest {
  name: string;
  description?: string | null;
  sellingPrice: number;
}

export interface CreateRecipeRequest {
  menuItemId: string;
  version: number;
  isActive: boolean;
  ingredients: {
    ingredientId: string;
    quantityRequired: number;
    unit?: string | null;
  }[];
}
