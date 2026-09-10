import type {
  CategoryResponse,
  ConsumeStockRequest,
  CreateCategoryRequest,
  CreateIngredientRequest,
  CreateStorageLocationRequest,
  IngredientResponse,
  InventoryResponse,
  LoginRequest,
  LoginResponse,
  ReceiveStockRequest,
  RecordWasteRequest,
  AdjustStockRequest,
  StockBatchResponse,
  StorageLocationResponse,
  TransferStockRequest,
  UpdateCategoryRequest,
  UpdateIngredientRequest,
  UpdateStorageLocationRequest,
} from '../types';

const TOKEN_KEY = 'restaurant_auth_token';
const USER_KEY = 'restaurant_auth_user';

// Immediately clear stored session so the app always starts on login
try {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
} catch {
  // ignore
}

export const getStoredToken = (): string | null => {
  const user = getStoredUser();
  return user ? user.token : null;
};

export const getStoredUser = (): LoginResponse | null => {
  const json = localStorage.getItem(USER_KEY);
  if (!json) return null;
  try {
    const user = JSON.parse(json) as LoginResponse;
    if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    return user;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setStoredAuth = (auth: LoginResponse | null) => {
  if (auth) {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(USER_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      if (!endpoint.includes('/api/Auth/login')) {
        setStoredAuth(null);
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }

    let errorMessage = `Request failed (${res.status})`;
    try {
      const errorJson = await res.json();
      if (errorJson.message) {
        errorMessage = errorJson.message;
      } else if (errorJson.errors) {
        errorMessage = Object.values(errorJson.errors).flat().join(' ');
      } else if (errorJson.title) {
        errorMessage = errorJson.title;
      }
    } catch {
      const text = await res.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Authentication
  login: async (creds: LoginRequest): Promise<LoginResponse> => {
    const data = await request<LoginResponse>('/api/Auth/login', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
    setStoredAuth(data);
    return data;
  },

  logout: () => {
    setStoredAuth(null);
  },

  // Inventory
  getInventory: () => request<InventoryResponse[]>('/api/Inventory'),
  getInventoryByIngredient: (ingredientId: string) =>
    request<InventoryResponse>(`/api/Inventory/${ingredientId}`),
  getLowStock: () => request<InventoryResponse[]>('/api/Inventory/low-stock'),
  getExpiringStock: (days = 7) =>
    request<StockBatchResponse[]>(`/api/Inventory/expiring?days=${days}`),

  receiveStock: (data: ReceiveStockRequest) =>
    request<{ message: string }>('/api/Inventory/receive', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  consumeStock: (data: ConsumeStockRequest) =>
    request<{ message: string }>('/api/Inventory/consume', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  recordWaste: (data: RecordWasteRequest) =>
    request<{ message: string }>('/api/Inventory/waste', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adjustStock: (data: AdjustStockRequest) =>
    request<{ message: string }>('/api/Inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveAdjustment: (adjustmentId: string) =>
    request<{ message: string }>(`/api/Inventory/adjustments/${adjustmentId}/approve`, {
      method: 'POST',
    }),

  rejectAdjustment: (adjustmentId: string) =>
    request<{ message: string }>(`/api/Inventory/adjustments/${adjustmentId}/reject`, {
      method: 'POST',
    }),

  transferStock: (data: TransferStockRequest) =>
    request<{ message: string }>('/api/Inventory/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Ingredients Master Data
  getIngredients: () => request<IngredientResponse[]>('/api/Ingredients'),
  getIngredient: (id: string) => request<IngredientResponse>(`/api/Ingredients/${id}`),
  createIngredient: (data: CreateIngredientRequest) =>
    request<IngredientResponse>('/api/Ingredients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateIngredient: (id: string, data: UpdateIngredientRequest) =>
    request<IngredientResponse>(`/api/Ingredients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteIngredient: (id: string) =>
    request<void>(`/api/Ingredients/${id}`, {
      method: 'DELETE',
    }),

  // Categories Master Data
  getCategories: () => request<CategoryResponse[]>('/api/IngredientCategories'),
  createCategory: (data: CreateCategoryRequest) =>
    request<CategoryResponse>('/api/IngredientCategories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: UpdateCategoryRequest) =>
    request<CategoryResponse>(`/api/IngredientCategories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string) =>
    request<void>(`/api/IngredientCategories/${id}`, {
      method: 'DELETE',
    }),

  // Storage Locations Master Data
  getStorageLocations: () => request<StorageLocationResponse[]>('/api/StorageLocations'),
  createStorageLocation: (data: CreateStorageLocationRequest) =>
    request<StorageLocationResponse>('/api/StorageLocations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStorageLocation: (id: string, data: UpdateStorageLocationRequest) =>
    request<StorageLocationResponse>(`/api/StorageLocations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteStorageLocation: (id: string) =>
    request<void>(`/api/StorageLocations/${id}`, {
      method: 'DELETE',
    }),
};
