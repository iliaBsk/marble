/**
 * Declarative wizard step definitions.
 * Consumed by both the API (for validation context) and the browser (for rendering).
 *
 * @typedef {'toggle'|'chips'|'city-picker'|'chip-groups'} StepKind
 * @typedef {Object} StepOption
 * @property {string} value
 * @property {string} label
 *
 * @typedef {Object} WizardStep
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {StepKind} kind
 * @property {StepOption[]} [options]
 * @property {boolean} [multi]
 * @property {string} [dependsOn] - step id whose answer is needed first
 * @property {Object[]} [groups]  - for chip-groups kind
 */

import {
  MARITAL_STATUS_OPTIONS,
  KIDS_OPTIONS,
  MOVIE_GENRE_OPTIONS,
  FOOD_PREFERENCE_OPTIONS,
  ALLERGY_OPTIONS,
  TRAVEL_REGION_OPTIONS,
  TRAVEL_SUMMER_OPTIONS,
  TRAVEL_WINTER_OPTIONS,
} from './schema.js';

/** @param {string[]} values @param {(v:string)=>string} [labelFn] @returns {StepOption[]} */
const opts = (values, labelFn) =>
  values.map(v => ({ value: v, label: labelFn ? labelFn(v) : toLabel(v) }));

/** Convert snake/kebab-case to Title Case label */
function toLabel(v) {
  return v.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** @type {WizardStep[]} */
export const STEPS = [
  {
    id: 'maritalStatus',
    title: 'What\'s your relationship status?',
    kind: 'toggle',
    options: opts(MARITAL_STATUS_OPTIONS, v => ({
      single: 'Single',
      partnered: 'In a relationship',
      married: 'Married',
      divorced: 'Divorced / Separated',
      prefer_not_say: 'Prefer not to say',
    }[v])),
  },
  {
    id: 'kids',
    title: 'Any kids in the picture?',
    kind: 'toggle',
    options: opts(KIDS_OPTIONS, v => ({
      none: 'No kids',
      planning: 'Planning to have kids',
      expecting: 'Expecting',
      has_young: 'Young kids (0–10)',
      has_teen: 'Teenagers',
      has_adult: 'Adult children',
    }[v])),
  },
  {
    id: 'movieGenres',
    title: 'What kind of movies do you enjoy?',
    subtitle: 'Pick a few.',
    kind: 'chips',
    multi: true,
    options: opts(MOVIE_GENRE_OPTIONS),
  },
  {
    id: 'foodPreferences',
    title: 'Your food vibe?',
    subtitle: 'Pick everything that applies.',
    kind: 'chips',
    multi: true,
    options: opts(FOOD_PREFERENCE_OPTIONS),
  },
  {
    id: 'allergies',
    title: 'Any dietary restrictions or allergies?',
    kind: 'chips',
    multi: true,
    options: opts(ALLERGY_OPTIONS),
  },
  {
    id: 'location',
    title: 'Where are you based?',
    subtitle: 'We\'ll tailor local recommendations to your city.',
    kind: 'city-picker',
  },
  {
    id: 'favoriteShops',
    title: 'Where do you usually shop?',
    subtitle: 'Showing popular stores near you.',
    kind: 'chips',
    multi: true,
    dependsOn: 'location',
    options: [], // populated dynamically from shops-registry based on location answer
  },
  {
    id: 'travel',
    title: 'How do you like to travel?',
    kind: 'chip-groups',
    groups: [
      {
        id: 'regions',
        label: 'Where do you usually go?',
        multi: true,
        options: opts(TRAVEL_REGION_OPTIONS),
      },
      {
        id: 'summerTypes',
        label: 'Summer holidays?',
        multi: true,
        options: opts(TRAVEL_SUMMER_OPTIONS),
      },
      {
        id: 'winterTypes',
        label: 'Winter getaways?',
        multi: true,
        options: opts(TRAVEL_WINTER_OPTIONS),
      },
    ],
  },
  {
    id: 'freeform',
    title: 'Anything else we should know?',
    subtitle: 'Optional — max 280 characters.',
    kind: 'freeform',
  },
];

/** @returns {WizardStep|undefined} */
export function getStep(id) {
  return STEPS.find(s => s.id === id);
}
