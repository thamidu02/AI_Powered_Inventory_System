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

// Master Data: Supplier
export interface SupplierResponse {
  id: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierRequest {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
}

export interface UpdateSupplierRequest {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
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

export interface StockMovementResponse {
  id: string;
  ingredientId: string;
  ingredientName: string;
  sku: string;
  unit: string;
  stockBatchId: string;
  batchNumber: string;
  storageLocationId: string;
  storageLocationName: string;
  movementType: string;
  quantity: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  createdById: string;
  createdByName: string;
  createdByEmail: string;
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
  | {
      type: 'history';
      batch?: StockBatchResponse;
      ingredientId?: string;
      ingredientName?: string;
      unit?: string;
      sku?: string;
    }
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

// Procurement: Purchase Requests
export interface PurchaseRequestItemResponse {
  id: string;
  purchaseRequestId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  requestedQuantity: number;
  suggestedSupplierId?: string | null;
  suggestedSupplierName?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequestResponse {
  id: string;
  status: string; // DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED
  reason?: string | null;
  requestedAt: string;
  requestedById: string;
  requestedByName: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  items: PurchaseRequestItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseRequestItemRequest {
  ingredientId: string;
  requestedQuantity: number;
  suggestedSupplierId?: string | null;
  notes?: string | null;
}

export interface CreatePurchaseRequestRequest {
  reason?: string | null;
  items: CreatePurchaseRequestItemRequest[];
}

export interface UpdatePurchaseRequestItemRequest {
  ingredientId: string;
  requestedQuantity: number;
  suggestedSupplierId?: string | null;
  notes?: string | null;
}

export interface UpdatePurchaseRequestRequest {
  reason?: string | null;
  items: UpdatePurchaseRequestItemRequest[];
}

export interface RejectPurchaseRequestRequest {
  reason?: string | null;
}

// Procurement: Purchase Orders
export interface PurchaseOrderItemResponse {
  id: string;
  purchaseOrderId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  orderedQuantity: number;
  unitPrice: number;
  receivedQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderResponse {
  id: string;
  supplierId: string;
  supplierName: string;
  status: string;
  orderDate?: string | null;
  expectedDeliveryDate?: string | null;
  totalAmount: number;
  createdById: string;
  createdByName: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  items: PurchaseOrderItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderItemRequest {
  ingredientId: string;
  orderedQuantity: number;
  unitPrice: number;
}

export interface CreatePurchaseOrderRequest {
  supplierId: string;
  expectedDeliveryDate?: string | null;
  items: CreatePurchaseOrderItemRequest[];
}

export interface UpdatePurchaseOrderItemRequest {
  ingredientId: string;
  orderedQuantity: number;
  unitPrice: number;
}

export interface UpdatePurchaseOrderRequest {
  supplierId: string;
  expectedDeliveryDate?: string | null;
  items: UpdatePurchaseOrderItemRequest[];
}

export interface RejectPurchaseOrderRequest {
}

// Procurement: Goods Receipts
export interface CreateGoodsReceiptItemRequest {
  purchaseOrderItemId: string;
  storageLocationId: string;
  receivedQuantity: number;
  unitCost?: number | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

export interface CreateGoodsReceiptRequest {
  purchaseOrderId: string;
  notes?: string | null;
  items: CreateGoodsReceiptItemRequest[];
}

export interface GoodsReceiptItemResponse {
  id: string;
  goodsReceiptId: string;
  purchaseOrderItemId: string;
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  storageLocationId: string;
  storageLocationName: string;
  batchNumber: string;
  receivedQuantity: number;
  unitCost: number;
  expiryDate?: string | null;
  createdAt: string;
}

export interface GoodsReceiptResponse {
  id: string;
  purchaseOrderId: string;
  receivedById: string;
  receivedByName: string;
  receiptDate: string;
  notes?: string | null;
  items: GoodsReceiptItemResponse[];
  createdAt: string;
}

// ─── AI Assistant ──────────────────────────────────────────────────────────

export type AiEventType =
  | 'thinking'
  | 'intent'
  | 'tool_call'
  | 'tool_result'
  | 'message'
  | 'approval_required'
  | 'guided_workflow'
  | 'done'
  | 'error';

export interface AiEvent {
  type: AiEventType;
  text?: string;
  intent?: string;
  workflow_id?: string;
  workflow_type?: string;
  title?: string;
  description?: string;
  steps?: unknown[];
  step?: number;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  proposal?: AiProposal;
  data?: unknown;
}

export interface AiProposal {
  workflow_id:    string;
  workflow_type:  string;
  proposal_type:  'PURCHASE_REQUEST' | 'OPTIMIZATION';
  total_cost?:    number;
  item_count?:    number;
  items?:         AiProposalItem[];
  optimizations?: AiOptimization[];
  reasoning:      string;
}

export interface AiProposalItem {
  ingredient_id:   string;
  ingredient_name: string;
  supplier_id:     string;
  supplier_name:   string;
  quantity:        number;
  unit_price:      number;
  lead_time_days:  number;
  reasoning?:      string;
}

export interface AiOptimization {
  ingredient_id:   string;
  ingredient_name: string;
  current_min:     number;
  current_max:     number;
  new_minimum:     number;
  new_maximum:     number;
  reason:          string;
}

export interface AiGuidedWorkflowPayload {
  workflow_type: string;
  title: string;
  description: string;
  steps: any[];
}

export interface AiChatMessage {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  timestamp:   Date;
  events?:     AiEvent[];
  proposal?:   AiProposal;
  guidedWorkflow?: AiGuidedWorkflowPayload;
  workflowId?: string;
  isStreaming? : boolean;
}

export interface AiWorkflowSummary {
  id:           string;
  workflowType: string;
  status:       string;
  objective:    string;
  startedAt:    string;
  completedAt?: string;
  finalOutcome?: string;
  stepCount:    number;
}

export interface DemandPlanResponse {
  id: string;
  ingredientId: string;
  ingredientName: string;
  sku: string;
  unit: string;
  periodStart: string;
  periodEnd: string;
  weeklyForecast: number;
  dailyAverageDemand: number;
  currentStock: number;
  minimumStockLevel: number;
  maximumStockLevel: number;
  projectedStock: number;
  projectedShortage: number;
  stockCoverageDays: number;
  reorderRequired: boolean;
  recommendedOrderQuantity: number;
  recommendation: string;
  riskStatus: string;
  confidenceScore?: number;
  generatedBy: string;
  reason: string;
}

export interface PlanningRecommendationResponse {
  ingredientId: string;
  ingredientName: string;
  sku: string;
  unit: string;
  currentStock: number;
  weeklyForecast: number;
  minimumStockLevel: number;
  maximumStockLevel: number;
  projectedStock: number;
  shortage: number;
  recommendedOrderQuantity: number;
  recommendation: string;
  reason: string;
}

export interface PlanningRiskSummaryResponse {
  totalIngredients: number;
  stockRiskCount: number;
  highDemandCount: number;
  overstockRiskCount: number;
  reorderRequiredCount: number;
  riskItems: DemandPlanResponse[];
}


