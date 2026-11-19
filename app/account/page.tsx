"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUCKETS, isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email ?? null);
    });

    const subscription = client.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null);
    });
    return () => subscription.data.subscription.unsubscribe();
  }, []);

  async function sendMagicLink() {
    const client = getSupabaseClient();
    if (!client) return;
    setBusy(true);
    setMessage(null);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/account` },
    });
    setBusy(false);
    setMessage(error ? error.message : "Magic link sent — check your inbox.");
  }

  async function signOut() {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
    setSessionEmail(null);
    setMessage("Signed out.");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Account &amp; storage</h1>
        <Link href="/" className="text-[12px] text-amber-300 hover:text-amber-200">
          ← Back to workspace
        </Link>
      </div>

      <p className="text-[12.5px] leading-5 text-slate-400">
        This page is the Supabase skeleton required by the MVP: email auth, plan-image upload and GLB archiving. It is
        intentionally thin — the geometry core does not depend on it, and the app runs fully offline when the env vars
        below are empty.
      </p>

      {!isSupabaseConfigured ? (
        <section className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <h2 className="text-[13px] font-semibold text-amber-200">Supabase is not configured</h2>
          <p className="mt-1.5 text-[12px] leading-5 text-amber-100/70">
            Add the following to <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px]">.env.local</code>
            , then run the SQL in <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px]">supabase/schema.sql</code>:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2.5 font-mono text-[11px] leading-5 text-slate-300">
{`NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>`}
          </pre>
          <p className="mt-2 text-[11.5px] text-amber-100/60">
            Buckets created by the schema: <span className="font-mono">{BUCKETS.planImages}</span>,{" "}
            <span className="font-mono">{BUCKETS.glbExports}</span>.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          {sessionEmail ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-semibold text-slate-100">Signed in</h2>
                <p className="mt-1 text-[12px] text-slate-400">{sessionEmail}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-slate-300 hover:border-white/25"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-[13px] font-semibold text-slate-100">Sign in with a magic link</h2>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@studio.com"
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-amber-300/50"
                />
                <button
                  type="button"
                  disabled={busy || email.length < 3}
                  onClick={sendMagicLink}
                  className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send link"}
                </button>
              </div>
            </>
          )}
          {message ? <p className="mt-2 text-[11.5px] text-slate-400">{message}</p> : null}
        </section>
      )}

      <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400">What the skeleton wires up</h2>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-5 text-slate-400">
          <li>· <span className="text-slate-200">Auth</span> — magic-link sign-in via <span className="font-mono text-[11px]">supabase.auth</span></li>
          <li>· <span className="text-slate-200">Image upload</span> — reference photos into <span className="font-mono text-[11px]">{BUCKETS.planImages}</span></li>
          <li>· <span className="text-slate-200">GLB storage</span> — exports archived into <span className="font-mono text-[11px]">{BUCKETS.glbExports}</span> from the Export button</li>
          <li>· <span className="text-slate-200">Floor plan rows</span> — <span className="font-mono text-[11px]">floor_plans</span> table (geometry JSONB + metrics JSONB)</li>
        </ul>
      </section>
    </main>
  );
}
