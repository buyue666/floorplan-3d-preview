/**
 * Supabase configuration lives entirely in NEXT_PUBLIC_* env vars so the MVP
 * keeps running with zero backend: every helper degrades to a no-op result.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const BUCKETS = {
  planImages: "floorplan-images",
  glbExports: "glb-exports",
} as const;
