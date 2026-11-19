import { BUCKETS } from "./config";
import { getSupabaseClient } from "./client";

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UploadedAsset {
  path: string;
  publicUrl: string | null;
}

function uniquePath(fileName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${date}/${id}-${fileName.replace(/[^\w.-]+/g, "_")}`;
}

/** Uploads the reference photo / scanned floor plan for a project. */
export async function uploadFloorPlanImage(file: File): Promise<StorageResult<UploadedAsset>> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are empty)." };
  }

  const path = uniquePath(file.name);
  const { error } = await client.storage.from(BUCKETS.planImages).upload(path, file, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };

  const { data } = client.storage.from(BUCKETS.planImages).getPublicUrl(path);
  return { ok: true, data: { path, publicUrl: data.publicUrl } };
}

/** Stores an exported GLB so it can be reopened / shared later. */
export async function uploadGlbExport(blob: Blob, fileName: string): Promise<StorageResult<UploadedAsset>> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: "Supabase is not configured — the GLB was downloaded locally only." };
  }

  const path = uniquePath(fileName);
  const { error } = await client.storage.from(BUCKETS.glbExports).upload(path, blob, {
    contentType: "model/gltf-binary",
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };

  const { data } = client.storage.from(BUCKETS.glbExports).getPublicUrl(path);
  return { ok: true, data: { path, publicUrl: data.publicUrl } };
}

/** Lists previously exported GLBs for the signed-in user. */
export async function listGlbExports(): Promise<StorageResult<Array<{ name: string; url: string; updatedAt: string | null }>>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "Supabase is not configured." };

  const { data, error } = await client.storage.from(BUCKETS.glbExports).list("", { limit: 50, sortBy: { column: "created_at", order: "desc" } });
  if (error) return { ok: false, error: error.message };

  const items = (data ?? []).map((item) => {
    const { data: publicUrl } = client.storage.from(BUCKETS.glbExports).getPublicUrl(item.name);
    return { name: item.name, url: publicUrl.publicUrl, updatedAt: item.updated_at ?? item.created_at ?? null };
  });
  return { ok: true, data: items };
}

/** Persists the plan JSON + computed metrics for a signed-in user. */
export async function saveFloorPlan(input: {
  name: string;
  geometry: unknown;
  metrics: unknown;
}): Promise<StorageResult<{ id: string }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "Supabase is not configured." };

  const { data: userData } = await client.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Sign in first — floor plans are stored per user." };

  const { data, error } = await client
    .from("floor_plans")
    .insert({ user_id: user.id, name: input.name, geometry: input.geometry, metrics: input.metrics })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}
