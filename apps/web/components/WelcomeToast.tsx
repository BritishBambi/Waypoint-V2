"use client";

// Fires a welcome toast on mount, then scrubs ?welcome=1 from the URL
// without triggering a re-render or re-fetch (window.history.replaceState).
// Rendered by the homepage Server Component when searchParams.welcome === "1".

import { useEffect } from "react";
import { toast } from "@/lib/toast";

export function WelcomeToast({ displayName }: { displayName: string }) {
  useEffect(() => {
    // 300 ms delay gives the Toaster time to mount and register its listener
    // before the toast is pushed into the module-level store.
    const timer = setTimeout(() => {
      toast(`Welcome back, ${displayName}! 👋`);
      window.history.replaceState(null, "", "/");
    }, 300);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
