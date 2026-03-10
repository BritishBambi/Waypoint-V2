// Relative/absolute date formatting for display.

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getDate();
  const suffix = [11, 12, 13].includes(d % 100) ? "th"
    : d % 10 === 1 ? "st" : d % 10 === 2 ? "nd" : d % 10 === 3 ? "rd" : "th";
  return `${MONTHS[date.getMonth()]} ${d}${suffix} ${date.getFullYear()}`;
}
