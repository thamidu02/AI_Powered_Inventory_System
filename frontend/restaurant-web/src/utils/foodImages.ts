// Utility for mapping recipes, menu items, and ingredients to culinary photography and icons

export interface FoodImageEntry {
  keywords: string[];
  src: string;
  category: string;
  label: string;
}

export const FOOD_IMAGE_MAP: FoodImageEntry[] = [
  { keywords: ['cookie', 'cookies', 'biscuit', 'chocolate chip'], src: '/menu-images/cookies.jpg', category: 'Desserts', label: 'Chocolate Chip Cookies' },
  { keywords: ['lava cake', 'lava', 'chocolate cake', 'molten'], src: '/menu-images/lavacake.jpg', category: 'Desserts', label: 'Molten Chocolate Lava Cake' },
  { keywords: ['bean', 'beans', 'fried bean', 'fried beans', 'green bean', 'green beans', 'sauteed beans'], src: '/menu-images/beans.jpg', category: 'Sides', label: 'Savory Fried Green Beans' },
  { keywords: ['burger', 'beef', 'cheeseburger', 'patty', 'slider'], src: '/menu-images/burger.jpg', category: 'Main Course', label: 'Artisan Burger' },
  { keywords: ['pizza', 'pepperoni', 'margherita', 'flatbread', 'calzone'], src: '/menu-images/pizza.jpg', category: 'Main Course', label: 'Brick Oven Pizza' },
  { keywords: ['pasta', 'spaghetti', 'carbonara', 'bolognese', 'linguine', 'fettuccine', 'noodle', 'alfredo', 'penne', 'lasagna', 'macaroni'], src: '/menu-images/pasta.jpg', category: 'Main Course', label: 'Italian Pasta' },
  { keywords: ['salad', 'caesar', 'greek', 'coleslaw', 'greens', 'lettuce', 'garden'], src: '/menu-images/salad.jpg', category: 'Starters', label: 'Garden Fresh Salad' },
  { keywords: ['chicken', 'grilled', 'fried chicken', 'wings', 'poultry', 'tender', 'roast chicken'], src: '/menu-images/chicken.jpg', category: 'Main Course', label: 'Roasted Chicken' },
  { keywords: ['rice', 'bowl', 'fried rice', 'biryani', 'pilaf', 'risotto', 'grain'], src: '/menu-images/rice.jpg', category: 'Sides', label: 'Seasoned Rice Bowl' },
  { keywords: ['soup', 'bisque', 'chowder', 'broth', 'stew', 'cream soup', 'gazpacho', 'tomato soup'], src: '/menu-images/soup.jpg', category: 'Starters', label: 'Artisan Soup' },
  { keywords: ['steak', 'ribeye', 'sirloin', 'fillet', 'tenderloin', 'meat'], src: '/menu-images/burger.jpg', category: 'Main Course', label: 'Grilled Steak' },
  { keywords: ['fries', 'chips', 'onion ring', 'tots', 'potato', 'wedges', 'mashed'], src: '/menu-images/beans.jpg', category: 'Sides', label: 'Crispy Sides' },
  { keywords: ['cake', 'brownie', 'ice cream', 'dessert', 'pudding', 'tart', 'pie', 'sweet'], src: '/menu-images/lavacake.jpg', category: 'Desserts', label: 'Pastry & Dessert' },
  { keywords: ['coffee', 'tea', 'juice', 'soda', 'cocktail', 'beverage', 'drink', 'water', 'smoothie'], src: '/menu-images/default.jpg', category: 'Drinks', label: 'Beverages' },
];

const CUSTOM_IMAGES_STORAGE_KEY = 'savory_custom_food_images';

// Helper to get custom image overrides from localStorage
export const getCustomFoodImages = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(CUSTOM_IMAGES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

// Helper to save a custom image override for a dish
export const saveCustomFoodImage = (dishName: string, imageUrl: string): void => {
  try {
    const current = getCustomFoodImages();
    if (imageUrl.trim()) {
      current[dishName.trim().toLowerCase()] = imageUrl.trim();
    } else {
      delete current[dishName.trim().toLowerCase()];
    }
    localStorage.setItem(CUSTOM_IMAGES_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('Failed to save custom food image:', err);
  }
};

// Helper to remove custom image override
export const removeCustomFoodImage = (dishName: string): void => {
  try {
    const current = getCustomFoodImages();
    delete current[dishName.trim().toLowerCase()];
    localStorage.setItem(CUSTOM_IMAGES_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error('Failed to remove custom food image:', err);
  }
};

export const getFoodImage = (name: string): string => {
  if (!name) return '/menu-images/default.jpg';
  const lower = name.trim().toLowerCase();

  // 1. Check custom user-defined image overrides first
  const customMap = getCustomFoodImages();
  if (customMap[lower]) {
    return customMap[lower];
  }

  // 2. Check curated keyword map
  for (const entry of FOOD_IMAGE_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.src;
    }
  }

  return '/menu-images/default.jpg';
};

export const getFoodCategory = (name: string, description?: string | null): 'Starters' | 'Main Course' | 'Sides' | 'Desserts' | 'Drinks' => {
  const text = `${name} ${description || ''}`.toLowerCase();
  if (text.includes('starter') || text.includes('salad') || text.includes('soup') || text.includes('appetizer') || text.includes('wing') || text.includes('dip')) {
    return 'Starters';
  }
  if (text.includes('dessert') || text.includes('cookie') || text.includes('cake') || text.includes('pie') || text.includes('sweet') || text.includes('ice cream') || text.includes('brownie') || text.includes('lava')) {
    return 'Desserts';
  }
  if (text.includes('drink') || text.includes('beverage') || text.includes('juice') || text.includes('soda') || text.includes('coffee') || text.includes('tea') || text.includes('cocktail')) {
    return 'Drinks';
  }
  if (text.includes('side') || text.includes('bean') || text.includes('rice') || text.includes('fries') || text.includes('potato') || text.includes('bread') || text.includes('slaw')) {
    return 'Sides';
  }
  return 'Main Course';
};

export const getIngredientCategoryColor = (name: string): { bg: string; color: string; label: string } => {
  const lower = name.toLowerCase();
  if (lower.includes('chicken') || lower.includes('beef') || lower.includes('pork') || lower.includes('meat') || lower.includes('fish') || lower.includes('salmon') || lower.includes('shrimp')) {
    return { bg: '#FDE8E8', color: '#9B1C1C', label: 'Proteins & Meat' };
  }
  if (lower.includes('tomato') || lower.includes('onion') || lower.includes('garlic') || lower.includes('lettuce') || lower.includes('pepper') || lower.includes('vegetable') || lower.includes('herb') || lower.includes('mushroom') || lower.includes('bean')) {
    return { bg: '#E7F1EB', color: '#173F35', label: 'Fresh Produce' };
  }
  if (lower.includes('cheese') || lower.includes('milk') || lower.includes('butter') || lower.includes('cream') || lower.includes('parmesan') || lower.includes('mozzarella') || lower.includes('dairy')) {
    return { bg: '#FEF3C7', color: '#92400E', label: 'Dairy & Eggs' };
  }
  if (lower.includes('flour') || lower.includes('rice') || lower.includes('pasta') || lower.includes('bread') || lower.includes('grain') || lower.includes('sugar') || lower.includes('salt') || lower.includes('oil') || lower.includes('cocoa') || lower.includes('chocolate')) {
    return { bg: '#F3F4F6', color: '#374151', label: 'Pantry & Dry Goods' };
  }
  return { bg: '#EBF5FF', color: '#1E429F', label: 'Ingredients' };
};
