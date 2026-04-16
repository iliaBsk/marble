/**
 * @typedef {{ name: string, category: 'apparel'|'grocery'|'sport'|'lifestyle'|'home'|'electronics' }} ShopChip
 */

/** @type {Record<string, ShopChip[]>} */
const SHOPS_BY_CITY = {
  barcelona: [
    { name: 'Zara', category: 'apparel' },
    { name: 'Mango', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Massimo Dutti', category: 'apparel' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'Mercadona', category: 'grocery' },
    { name: 'El Corte Inglés', category: 'lifestyle' },
    { name: 'Bonpreu', category: 'grocery' },
    { name: 'IKEA', category: 'home' },
    { name: 'Media Markt', category: 'electronics' },
    { name: 'Carrefour', category: 'grocery' },
  ],
  madrid: [
    { name: 'Zara', category: 'apparel' },
    { name: 'El Corte Inglés', category: 'lifestyle' },
    { name: 'Mango', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'Mercadona', category: 'grocery' },
    { name: 'Primark', category: 'apparel' },
    { name: 'IKEA', category: 'home' },
    { name: 'Media Markt', category: 'electronics' },
    { name: 'Alcampo', category: 'grocery' },
    { name: 'Springfield', category: 'apparel' },
  ],
  london: [
    { name: 'Marks & Spencer', category: 'grocery' },
    { name: 'John Lewis', category: 'lifestyle' },
    { name: 'Sainsbury\'s', category: 'grocery' },
    { name: 'Tesco', category: 'grocery' },
    { name: 'Waitrose', category: 'grocery' },
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Primark', category: 'apparel' },
    { name: 'Selfridges', category: 'lifestyle' },
    { name: 'Boots', category: 'lifestyle' },
    { name: 'Argos', category: 'home' },
  ],
  berlin: [
    { name: 'Zalando', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Zara', category: 'apparel' },
    { name: 'REWE', category: 'grocery' },
    { name: 'Edeka', category: 'grocery' },
    { name: 'Aldi', category: 'grocery' },
    { name: 'dm', category: 'lifestyle' },
    { name: 'Saturn', category: 'electronics' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'IKEA', category: 'home' },
    { name: 'Kaufland', category: 'grocery' },
    { name: 'Lidl', category: 'grocery' },
  ],
  paris: [
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Monoprix', category: 'grocery' },
    { name: 'Carrefour', category: 'grocery' },
    { name: 'Fnac', category: 'electronics' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'Galeries Lafayette', category: 'lifestyle' },
    { name: 'Le Bon Marché', category: 'lifestyle' },
    { name: 'Sephora', category: 'lifestyle' },
    { name: 'IKEA', category: 'home' },
    { name: 'Leclerc', category: 'grocery' },
  ],
  'new york': [
    { name: 'Whole Foods', category: 'grocery' },
    { name: 'Trader Joe\'s', category: 'grocery' },
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Target', category: 'lifestyle' },
    { name: 'Nordstrom', category: 'apparel' },
    { name: 'Best Buy', category: 'electronics' },
    { name: 'REI', category: 'sport' },
    { name: 'Costco', category: 'grocery' },
    { name: 'Bloomingdale\'s', category: 'lifestyle' },
    { name: 'B&H Photo', category: 'electronics' },
  ],
  'san francisco': [
    { name: 'Whole Foods', category: 'grocery' },
    { name: 'Trader Joe\'s', category: 'grocery' },
    { name: 'REI', category: 'sport' },
    { name: 'Patagonia', category: 'apparel' },
    { name: 'Lululemon', category: 'sport' },
    { name: 'Apple Store', category: 'electronics' },
    { name: 'Nordstrom', category: 'apparel' },
    { name: 'Target', category: 'lifestyle' },
    { name: 'Best Buy', category: 'electronics' },
    { name: 'Safeway', category: 'grocery' },
    { name: 'Rainbow Grocery', category: 'grocery' },
    { name: 'Zara', category: 'apparel' },
  ],
  tokyo: [
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'GU', category: 'apparel' },
    { name: 'Muji', category: 'lifestyle' },
    { name: 'Don Quijote', category: 'lifestyle' },
    { name: 'Lawson', category: 'grocery' },
    { name: '7-Eleven', category: 'grocery' },
    { name: 'Yodobashi Camera', category: 'electronics' },
    { name: 'Yamada Denki', category: 'electronics' },
    { name: 'Isetan', category: 'lifestyle' },
    { name: 'Tokyu Hands', category: 'home' },
    { name: 'ABC Mart', category: 'apparel' },
    { name: 'Bic Camera', category: 'electronics' },
  ],
  seoul: [
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Zara', category: 'apparel' },
    { name: 'Coupang', category: 'lifestyle' },
    { name: 'Lotte Mart', category: 'grocery' },
    { name: 'E-Mart', category: 'grocery' },
    { name: 'CU', category: 'grocery' },
    { name: 'Samsung Digital Plaza', category: 'electronics' },
    { name: 'Olive Young', category: 'lifestyle' },
    { name: 'Hyundai Department Store', category: 'lifestyle' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'Spao', category: 'apparel' },
  ],
  amsterdam: [
    { name: 'Albert Heijn', category: 'grocery' },
    { name: 'Hema', category: 'lifestyle' },
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'MediaMarkt', category: 'electronics' },
    { name: 'IKEA', category: 'home' },
    { name: 'Etos', category: 'lifestyle' },
    { name: 'Jumbo', category: 'grocery' },
    { name: 'Bijenkorf', category: 'lifestyle' },
    { name: 'Action', category: 'lifestyle' },
  ],
  milan: [
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Esselunga', category: 'grocery' },
    { name: 'Rinascente', category: 'lifestyle' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'MediaWorld', category: 'electronics' },
    { name: 'IKEA', category: 'home' },
    { name: 'Carrefour', category: 'grocery' },
    { name: 'Coin', category: 'lifestyle' },
    { name: 'Prada', category: 'apparel' },
    { name: 'Gucci', category: 'apparel' },
  ],
  dubai: [
    { name: 'Zara', category: 'apparel' },
    { name: 'H&M', category: 'apparel' },
    { name: 'Uniqlo', category: 'apparel' },
    { name: 'Carrefour', category: 'grocery' },
    { name: 'Spinneys', category: 'grocery' },
    { name: 'LuLu Hypermarket', category: 'grocery' },
    { name: 'Decathlon', category: 'sport' },
    { name: 'Virgin Megastore', category: 'electronics' },
    { name: 'Harvey Nichols', category: 'lifestyle' },
    { name: 'Marks & Spencer', category: 'grocery' },
    { name: 'IKEA', category: 'home' },
    { name: 'Noon', category: 'lifestyle' },
  ],
};

/**
 * Normalize a city name to the registry key format.
 * @param {string} city
 * @returns {string}
 */
function normalizeCity(city) {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .trim();
}

/**
 * Get shop chips for a city, with case/accent-insensitive matching.
 * Returns [] for unknown cities so callers can still render an empty step.
 * @param {string} city
 * @returns {ShopChip[]}
 */
export function getShopsForCity(city) {
  if (!city) return [];
  return SHOPS_BY_CITY[normalizeCity(city)] || [];
}

/** @returns {string[]} All known cities in the registry */
export function getKnownCities() {
  return Object.keys(SHOPS_BY_CITY).map(c =>
    c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
}
