/**
 * Declarative wizard step definitions.
 * Consumed by both the API (for validation context) and the browser (for rendering).
 *
 * @typedef {'toggle'|'chips'|'city-picker'|'chip-groups'|'freeform'|'pairs'} StepKind
 * @typedef {Object} StepOption
 * @property {string} value
 * @property {string} label
 *
 * @typedef {Object} PairDef
 * @property {string} id
 * @property {string} labelA
 * @property {string} labelB
 *
 * @typedef {Object} WizardStep
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {StepKind} kind
 * @property {StepOption[]} [options]
 * @property {boolean} [multi]
 * @property {number} [max]
 * @property {number} [maxLength]
 * @property {boolean} [nlp]
 * @property {string} [dependsOn]
 * @property {Object[]} [groups]
 * @property {PairDef[]} [pairs]
 * @property {{ kind: string, optional: boolean, max: number, options: StepOption[] }} [ageBracket]
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
  AGE_BRACKET_OPTIONS,
  PROFESSIONAL_OPTIONS,
  FINANCIAL_MINDSET_OPTIONS,
  PASSION_OPTIONS,
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
    title: "What's your relationship status?",
    kind: 'toggle',
    options: opts(MARITAL_STATUS_OPTIONS, v => ({
      single: 'Single',
      partnered: 'In a relationship',
      married: 'Married',
      divorced: 'Divorced / Separated',
      prefer_not_say: 'Prefer not to say',
    }[v])),
    ageBracket: {
      kind: 'chips',
      optional: true,
      max: 1,
      options: opts(AGE_BRACKET_OPTIONS),
    },
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
    subtitle: "We'll tailor local recommendations to your city.",
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
    title: "What's the #1 thing you want to improve right now?",
    subtitle: "Optional — tell us what you're trying to solve. (120 chars)",
    kind: 'freeform',
    maxLength: 120,
    nlp: true,
  },
  {
    id: 'professional',
    title: 'What best describes your main role?',
    kind: 'toggle',
    options: opts(PROFESSIONAL_OPTIONS, v => ({
      founder: 'Founder / Co-founder',
      executive: 'Executive / Senior Manager',
      investor: 'Investor / Fund Manager',
      professional: 'Professional / Specialist',
      other: 'Other',
    }[v])),
  },
  {
    id: 'financialMindset',
    title: 'Which feels most relevant to you right now?',
    kind: 'toggle',
    options: opts(FINANCIAL_MINDSET_OPTIONS, v => ({
      grow_income: 'Growing my income or business',
      protect_assets: 'Protecting and investing what I have',
      manage_costs: 'Managing costs and getting more value',
      build_something: 'Building something new from scratch',
    }[v])),
  },
  {
    id: 'valuesFingerprint',
    title: 'Choose one from each pair — no right answers',
    kind: 'pairs',
    pairs: [
      { id: 'speedVsDepth',           labelA: 'Speed',     labelB: 'Depth'       },
      { id: 'stabilityVsOpportunity', labelA: 'Stability', labelB: 'Opportunity' },
      { id: 'localVsGlobal',          labelA: 'Local',     labelB: 'Global'      },
    ],
  },
  {
    id: 'passions',
    title: 'Outside of work, what do you care most about?',
    subtitle: 'Pick up to 2.',
    kind: 'chips',
    multi: true,
    max: 2,
    options: opts(PASSION_OPTIONS, v => ({
      'health-fitness': 'Health & Fitness',
      family:           'Family',
      travel:           'Travel',
      investing:        'Investing',
      sports:           'Sports',
      technology:       'Technology',
      'food-lifestyle': 'Food & Lifestyle',
      'arts-culture':   'Arts & Culture',
    }[v])),
  },
];

/** @returns {WizardStep|undefined} */
export function getStep(id) {
  return STEPS.find(s => s.id === id);
}
