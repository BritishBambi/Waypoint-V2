const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-teal-600", "bg-rose-600",
  "bg-amber-600", "bg-emerald-600", "bg-sky-600", "bg-pink-600",
];

export function avatarBg(username: string): string {
  const hash = username.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
