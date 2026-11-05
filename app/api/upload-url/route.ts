import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";
import { getUploadUrl } from "@/lib/r2";

const ALLOWED_TYPES = ["image/jpeg","image/png","image/webp","image/heic","image/heif","video/mp4","video/quicktime"];
const MAX_PHOTO = 30 * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;

export async function POST(req: Request) {
  const { albumId, guestId, guestToken, fileName, contentType, size } = await req.json();

  if (!albumId || !guestId || !guestToken || !fileName || !contentType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const isVideo = contentType.startsWith("video/");
  const maxSize = isVideo ? MAX_VIDEO : MAX_PHOTO;
  if (size > maxSize) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
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

  const uploadUrl = await getUploadUrl(r2Key, contentType);

  return NextResponse.json({ uploadUrl, r2Key });
}
