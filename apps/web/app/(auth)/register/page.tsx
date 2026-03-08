"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

type Fields = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const [fields, setFields] = useState<Fields>({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Fields>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  function set(key: keyof Fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function validate(): boolean {
    const errs: Partial<Fields> = {};

    if (!fields.email.includes("@")) {
      errs.email = "Enter a valid email address";
    }
    if (!USERNAME_RE.test(fields.username)) {
      errs.username = "3–30 characters: lowercase letters, numbers, and underscores only";
    }
    if (fields.password.length < 8) {
      errs.password = "Must be at least 8 characters";
    }
    if (fields.password !== fields.confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: fields.email,
      password: fields.password,
      options: {
        // Picked up by the handle_new_user trigger → profiles.username
        data: { username: fields.username },
      },
    });

    if (error) {
      setServerError(error.message);
      setLoading(false);
      return;
    }

    if (data.session && data.user) {
      // Email confirmation is disabled — session is available immediately.
      // Upsert the profile row; this is a safe no-op if the handle_new_user
      // trigger already created it.
      // (supabase as any) works around a `never` type inference bug in
      // @supabase/supabase-js when the generated Database type includes
      // __InternalSupabase: { PostgrestVersion: "14.1" }.
      await (supabase as any).from("profiles").upsert(
        { id: data.user.id, username: fields.username },
        { onConflict: "id" }
      );
      router.push("/dashboard");
      router.refresh();
    } else {
      // Email confirmation required — tell the user to check their inbox.
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center">
        <div className="rounded-xl bg-zinc-900 p-8">
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="mt-3 text-sm text-zinc-400">
            We sent a confirmation link to{" "}
            <span className="text-white">{fields.email}</span>. Click the link
            to activate your account and sign in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>

      <div className="rounded-xl bg-zinc-900 p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {serverError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {serverError}
            </p>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={fields.email}
              onChange={set("email")}
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email}</p>
            )}
          </div>

          {/* Username */}
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-zinc-500">
                @
              </span>
              <input
                id="username"
                type="text"
                value={fields.username}
                onChange={set("username")}
                autoComplete="username"
                placeholder="yourname"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-7 pr-3 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {errors.username ? (
              <p className="mt-1 text-xs text-red-400">{errors.username}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Lowercase letters, numbers, underscores. 3–30 characters.
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={fields.password}
              onChange={set("password")}
              autoComplete="new-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-zinc-300"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={fields.confirmPassword}
              onChange={set("confirmPassword")}
              autoComplete="new-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
