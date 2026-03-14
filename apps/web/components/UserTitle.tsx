export function UserTitle({ name, color }: { name: string; color?: string }) {
  const c = color ?? "#a78bfa"; // violet-400 fallback
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: c,
        backgroundColor: `${c}26`,  // ~15% opacity background
        borderColor: `${c}33`,       // ~20% opacity border
      }}
    >
      {name}
    </span>
  );
}
