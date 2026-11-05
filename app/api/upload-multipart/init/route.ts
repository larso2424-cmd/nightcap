import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";
import { createMultipartUpload, getPartUploadUrl } from "@/lib/r2";

const PART_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const { albumId, guestId, guestToken, fileName, contentType, size } = await req.json();

  if (!albumId || !guestId || !guestToken || !fileName || !contentType || !size) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const tokenHash = hashToken(guestToken);

  const { data: guest } = await supabase
    .from("guests")
    .select("id, album_id, albums(expires_at, deleted_at)")
    .eq("id", guestId)
    .eq("guest_token_hash", tokenHash)
    .single();

  if (!guest || guest.album_id !== albumId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const album = (guest as any).albums;
  if (album?.deleted_at || (album?.expires_at && new Date(album.expires_at) < new Date())) {
    return NextResponse.json({ error: "This album has expired" }, { status: 410 });
  }

  const ext = fileName.split(".").pop() ?? "bin";
  const r2Key = `${albumId}/${guestId}/${Date.now()}.${ext}`;

  const uploadId = await createMultipartUpload(r2Key, contentType);
  const partCount = Math.ceil(size / PART_SIZE);

  const partUrls = await Promise.all(
    Array.from({ length: partCount }, (_, i) => getPartUploadUrl(r2Key, uploadId, i + 1))
  );

  return NextResponse.json({ uploadId, r2Key, partUrls, partSize: PART_SIZE });
}
