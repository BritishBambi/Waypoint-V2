/**
 * Format a playtime value in minutes into a human-readable string.
 *
 *  < 60 min  → "45 mins"
 *  < 100 hrs → "12.5 hrs"
 *  ≥ 100 hrs → "142 hrs"
 */
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours >= 100) return `${Math.round(hours)} hrs`;
  return `${hours.toFixed(1)} hrs`;
}
