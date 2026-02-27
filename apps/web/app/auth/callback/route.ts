import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // Allow deep-linking back to a specific page after auth
  const next = searchParams.get("next") ?? "/dashboard";

  // ── OAuth / PKCE code flow (Discord, GitHub, etc.) ──────────────────────
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=Authentication+failed`);
  }

  // ── Email OTP / confirmation link flow ──────────────────────────────────
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=Email+verification+failed`
    );
  }

  return NextResponse.redirect(`${origin}/login?error=Authentication+failed`);
}
