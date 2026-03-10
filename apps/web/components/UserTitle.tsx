export function UserTitle({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-400 ring-1 ring-inset ring-violet-500/20">
      {name}
    </span>
  );
}
