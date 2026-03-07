// Converts a stored game_log status value to a human-readable display label.
// The DB enum value 'played' is surfaced as 'Completed' in the UI.
// All other statuses are title-cased from the raw value.
export function formatStatus(status: string): string {
  if (status === "played")   return "Completed";
  if (status === "backlog")  return "Backlog";
  if (status === "wishlist") return "Wishlist";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
