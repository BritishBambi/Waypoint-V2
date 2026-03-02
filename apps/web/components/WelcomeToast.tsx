"use client";

// Fires a welcome toast on mount, then scrubs ?welcome=1 from the URL
// without triggering a re-render or re-fetch (window.history.replaceState).
// Rendered by the homepage Server Component when searchParams.welcome === "1".

import { useEffect } from "react";
import { toast } from "@/lib/toast";

export function WelcomeToast({ displayName }: { displayName: string }) {
  useEffect(() => {
    toast(`Welcome back, ${displayName}! 👋`);
    // Remove the query param from the address bar without a navigation.
    window.history.replaceState(null, "", "/");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
