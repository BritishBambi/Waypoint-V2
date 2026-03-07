"use client";

// PinShowcaseButton — lets a list owner pin this list to their profile showcase.
// Shows current pin status (slot 1 / slot 2 / not pinned) and a dropdown to change it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PinState = "none" | "slot1" | "slot2";

interface Props {
  listId: string;
  profileId: string;
  initialPinState: PinState;
}

export function PinShowcaseButton({ listId, profileId, initialPinState }: Props) {
  const [pinState, setPinState] = useState<PinState>(initialPinState);
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const router = useRouter();

  async function applyPin(next: PinState) {
    if (next === pinState) { setOpen(false); return; }
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, string | null> = { showcase_type: null, showcase_list_1_id: null, showcase_list_2_id: null };

    if (next === "slot1") {
      payload.showcase_type    = "list";
      payload.showcase_list_1_id = listId;
      // keep slot2 as-is — we only clear if pinning to slot1 would duplicate
      // (handled by not touching showcase_list_2_id in payload means we need to fetch current)
    } else if (next === "slot2") {
      payload.showcase_type    = "list";
      payload.showcase_list_2_id = listId;
    }
    // next === "none" → all null (already set above)

    // For slot1/slot2 we need to keep the OTHER slot's current value.
    // Fetch current profile showcase state first.
    if (next !== "none") {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("showcase_list_1_id, showcase_list_2_id")
        .eq("id", profileId)
        .maybeSingle();

      if (next === "slot1") {
        // Keep slot2, but make sure it isn't this same list
        const currentSlot2 = (prof as any)?.showcase_list_2_id ?? null;
        payload.showcase_list_2_id = currentSlot2 === listId ? null : currentSlot2;
      } else {
        // Keep slot1, but make sure it isn't this same list
        const currentSlot1 = (prof as any)?.showcase_list_1_id ?? null;
        payload.showcase_list_1_id = currentSlot1 === listId ? null : currentSlot1;
      }
    }

    const { error } = await (supabase as any)
      .from("profiles")
      .update(payload)
      .eq("id", profileId);

    setSaving(false);
    if (!error) {
      setPinState(next);
      setOpen(false);
      router.refresh();
    }
  }

  const label =
    pinState === "slot1" ? "Pinned (Slot 1)" :
    pinState === "slot2" ? "Pinned (Slot 2)" :
    "Pin to Showcase";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          pinState !== "none"
            ? "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl shadow-black/40">
          <PinOption label="Unpin" active={pinState === "none"} onClick={() => applyPin("none")} />
          <PinOption label="Pin as Slot 1" active={pinState === "slot1"} onClick={() => applyPin("slot1")} />
          <PinOption label="Pin as Slot 2" active={pinState === "slot2"} onClick={() => applyPin("slot2")} />
        </div>
      )}
    </div>
  );
}

function PinOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-800 ${
        active ? "text-violet-400" : "text-zinc-400 hover:text-white"
      }`}
    >
      {label}
      {active && (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}
