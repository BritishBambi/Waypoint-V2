// Steam app icon URL helper.
// icon_hash is the img_icon_url value returned by GetOwnedGames with include_appinfo=1.
// These are 32×32 .ico files — small but crisp and perfectly suited for circular thumbnails.

export function steamIconUrl(
  steamAppId: number | null,
  iconHash: string | null
): string | null {
  if (!steamAppId || !iconHash) return null;
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${steamAppId}/${iconHash}.ico`;
}
