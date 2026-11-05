import { supabase } from "@/lib/supabase-client";

// Uploads are images only, 5 MB at most (AGENTS.md, File Storage). The buckets enforce the same
// limits; checking here gives the person a clear message before the upload starts.
export type ImageBucket = "shop-media" | "payment-qr" | "payment-proofs";

export const maxImageBytes = 5 * 1024 * 1024;
export const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const imageInputAccept = acceptedImageTypes.join(",");

const extensions: Record<(typeof acceptedImageTypes)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ImageProblem = "type" | "size";

export function findImageProblem(file: File): ImageProblem | null {
  if (!(acceptedImageTypes as readonly string[]).includes(file.type)) return "type";
  if (file.size > maxImageBytes) return "size";
  return null;
}

// Stores the file under `folder` with a fresh name and returns its path in the bucket.
export async function uploadImage(bucket: ImageBucket, folder: string, file: File): Promise<string> {
  const extension = extensions[file.type as (typeof acceptedImageTypes)[number]];
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

// Removing a replaced file only frees space; a failure leaves an unused file, never a broken row.
export async function removeStoredImage(bucket: ImageBucket, path: string): Promise<void> {
  await supabase.storage.from(bucket).remove([path]);
}

// The payment-proofs bucket is private: screenshots are read through short-lived signed URLs, by the
// uploader and the branch's deposit reviewers.
const signedUrlSeconds = 60;

export async function privateImageUrl(bucket: "payment-proofs", path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, signedUrlSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export function publicImageUrl(bucket: Exclude<ImageBucket, "payment-proofs">, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
