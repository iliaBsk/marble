/**
 * @typedef {'single'|'partnered'|'married'|'divorced'|'prefer_not_say'} MaritalStatus
 * @typedef {'none'|'planning'|'expecting'|'has_young'|'has_teen'|'has_adult'} KidsStatus
 *
 * @typedef {Object} OnboardingAnswers
 * @property {MaritalStatus} maritalStatus
 * @property {KidsStatus} kids
 * @property {string[]} movieGenres
 * @property {string[]} foodPreferences
 * @property {string[]} allergies
 * @property {{ city: string, country?: string }} location
 * @property {string[]} favoriteShops
 * @property {{ regions: string[], summerTypes: string[], winterTypes: string[] }} travel
 * @property {string} [freeform]
 */

export const MARITAL_STATUS_OPTIONS = ['single', 'partnered', 'married', 'divorced', 'prefer_not_say'];
export const KIDS_OPTIONS = ['none', 'planning', 'expecting', 'has_young', 'has_teen', 'has_adult'];
export const MOVIE_GENRE_OPTIONS = [
  'action', 'comedy', 'drama', 'sci-fi', 'thriller', 'horror',
  'romance', 'documentary', 'animation', 'fantasy', 'mystery',
  'biography', 'history', 'music', 'sport', 'western', 'crime', 'family'
];
export const FOOD_PREFERENCE_OPTIONS = [
  'mediterranean', 'vegan', 'vegetarian', 'keto', 'high-protein',
  'comfort', 'street-food', 'fine-dining', 'asian', 'latin',
  'middle-eastern', 'japanese', 'indian', 'mexican', 'italian'
];
export const ALLERGY_OPTIONS = ['none', 'gluten', 'dairy', 'nuts', 'shellfish', 'eggs', 'soy', 'fish'];
export const TRAVEL_REGION_OPTIONS = [
  'EU', 'UK', 'North America', 'Latin America', 'Asia',
  'Southeast Asia', 'Middle East', 'Africa', 'Oceania', 'Caribbean'
];
export const TRAVEL_SUMMER_OPTIONS = [
  'beach', 'city-break', 'festival', 'hiking', 'road-trip',
  'island-hopping', 'sailing', 'adventure'
];
export const TRAVEL_WINTER_OPTIONS = [
  'skiing', 'city-break', 'warm-escape', 'christmas-markets',
  'northern-lights', 'staycation', 'wellness-retreat'
];

/**
 * @param {unknown} input
 * @returns {{ ok: true, value: OnboardingAnswers } | { ok: false, errors: string[] }}
 */
export function validateOnboardingAnswers(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['answers must be an object'] };
  }

  const a = /** @type {Record<string,unknown>} */ (input);

  if (!MARITAL_STATUS_OPTIONS.includes(/** @type {string} */ (a.maritalStatus))) {
    errors.push(`maritalStatus must be one of: ${MARITAL_STATUS_OPTIONS.join(', ')}`);
  }

  if (!KIDS_OPTIONS.includes(/** @type {string} */ (a.kids))) {
    errors.push(`kids must be one of: ${KIDS_OPTIONS.join(', ')}`);
  }

  if (!Array.isArray(a.movieGenres) || a.movieGenres.length === 0) {
    errors.push('movieGenres must be a non-empty array');
  } else {
    const invalid = a.movieGenres.filter(v => !MOVIE_GENRE_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid movieGenres: ${invalid.join(', ')}`);
  }

  if (!Array.isArray(a.foodPreferences) || a.foodPreferences.length === 0) {
    errors.push('foodPreferences must be a non-empty array');
  } else {
    const invalid = a.foodPreferences.filter(v => !FOOD_PREFERENCE_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid foodPreferences: ${invalid.join(', ')}`);
  }

  if (!Array.isArray(a.allergies)) {
    errors.push('allergies must be an array');
  } else {
    const invalid = a.allergies.filter(v => !ALLERGY_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid allergies: ${invalid.join(', ')}`);
  }

  if (!a.location || typeof a.location !== 'object') {
    errors.push('location must be an object');
  } else {
    const loc = /** @type {Record<string,unknown>} */ (a.location);
    if (!loc.city || typeof loc.city !== 'string' || loc.city.trim() === '') {
      errors.push('location.city is required');
    } else if (loc.city.length > 100) {
      errors.push('location.city must be 100 characters or fewer');
    }
  }

  if (!Array.isArray(a.favoriteShops)) {
    errors.push('favoriteShops must be an array');
  } else {
    const invalid = a.favoriteShops.filter(
      v => typeof v !== 'string' || v.trim() === '' || v.length > 100
    );
    if (invalid.length) errors.push('favoriteShops must be non-empty strings of ≤100 characters each');
  }

  if (!a.travel || typeof a.travel !== 'object') {
    errors.push('travel must be an object');
  } else {
    const t = /** @type {Record<string,unknown>} */ (a.travel);
    if (!Array.isArray(t.regions)) {
      errors.push('travel.regions must be an array');
    } else {
      const invalid = t.regions.filter(v => !TRAVEL_REGION_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.regions: ${invalid.join(', ')}`);
    }
    if (!Array.isArray(t.summerTypes)) {
      errors.push('travel.summerTypes must be an array');
    } else {
      const invalid = t.summerTypes.filter(v => !TRAVEL_SUMMER_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.summerTypes: ${invalid.join(', ')}`);
    }
    if (!Array.isArray(t.winterTypes)) {
      errors.push('travel.winterTypes must be an array');
    } else {
      const invalid = t.winterTypes.filter(v => !TRAVEL_WINTER_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.winterTypes: ${invalid.join(', ')}`);
    }
  }

  if (a.freeform !== undefined && typeof a.freeform !== 'string') {
    errors.push('freeform must be a string if provided');
  }

  if (a.freeform && typeof a.freeform === 'string' && a.freeform.length > 280) {
    errors.push('freeform must be 280 characters or fewer');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: /** @type {OnboardingAnswers} */ (input) };
}
