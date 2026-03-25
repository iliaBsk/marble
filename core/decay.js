/**
 * Prism Decay Functions
 *
 * Everything fades. Interests, trust, freshness — all decay over time.
 * This creates a system that naturally adapts without needing explicit "unsubscribe."
 */

/**
 * Exponential decay with configurable half-life
 * @param {number} value - Current value
 * @param {number} daysSinceUpdate - Days since last reinforcement
 * @param {number} halfLife - Days until value halves (default: 14)
 * @returns {number} Decayed value
 */
export function exponentialDecay(value, daysSinceUpdate, halfLife = 14) {
  return value * Math.pow(0.5, daysSinceUpdate / halfLife);
}

/**
 * Freshness score for a story based on age in hours
 * @param {number} hoursOld - Hours since publication
 * @returns {number} 0-1 freshness multiplier
 */
export function freshness(hoursOld) {
  if (hoursOld < 1) return 1.0;
  if (hoursOld < 3) return 0.95;
  if (hoursOld < 6) return 0.9;
  if (hoursOld < 12) return 0.8;
  if (hoursOld < 24) return 0.65;
  if (hoursOld < 48) return 0.45;
  return Math.max(0.1, 0.45 * Math.pow(0.5, (hoursOld - 48) / 48));
}

/**
 * Run decay pass on all user interests
 * Call this daily to keep the KG current
 * @param {KnowledgeGraph} kg
 */
export function decayPass(kg) {
  const now = Date.now();
  for (const interest of kg.user.interests) {
    const days = (now - new Date(interest.last_boost).getTime()) / 86400000;
    const decayed = exponentialDecay(interest.weight, days);

    if (decayed < 0.05) {
      interest.trend = 'falling';
    } else if (decayed < interest.weight * 0.8) {
      interest.trend = 'falling';
    }
    // Note: we don't overwrite weight here — decay is applied at read time
    // This preserves the "raw" weight for boosting calculations
  }

  // Prune interests that have been effectively dead for 30+ days
  kg.user.interests = kg.user.interests.filter(i => {
    const days = (now - new Date(i.last_boost).getTime()) / 86400000;
    return exponentialDecay(i.weight, days) >= 0.01;
  });
}
