import { readFile } from "node:fs/promises";
import { get } from "@vercel/blob";

// Read-only compatibility for existing archives. New generations never create an archive.
export async function readCallImage(media: { location: string; storage: string }) {
  if (media.storage === "local") return new Uint8Array(await readFile(media.location));
  const result = await get(media.location, { access: "private", token: process.env.PINWU_PRIVATE_BLOB_TOKEN, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("Unable to read private image archive");
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}
