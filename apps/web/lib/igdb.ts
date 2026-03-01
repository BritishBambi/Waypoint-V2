// apps/web/lib/igdb.ts
// Utilities for working with IGDB image URLs at render time.
//
// The database stores cover_url with the t_cover_big size token
// (set by the igdb-game-detail Edge Function). Swap it here at display
// time rather than re-syncing the DB when we want a different resolution.
//
// IGDB URL format:
//   //images.igdb.com/igdb/image/upload/t_SIZE/IMAGE_HASH.jpg
//
// Useful sizes for covers (portrait, ~2:3 ratio):
//   t_cover_big  — 264×374   (small thumbnails, feed items)
//   t_720p       — ~480×720  (large grid cards, detail page)

export function igdbCover(
  url: string | null,
  size: "t_720p" | "t_cover_big"
): string | null {
  if (!url) return null;
  // Replace whatever size token is already in the URL (t_thumb, t_cover_big,
  // t_cover_big_2x, etc.) so this works regardless of what was stored.
  return url.replace(/\/t_[a-z0-9_]+\//, `/${size}/`);
}
