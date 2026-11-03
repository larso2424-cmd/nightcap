import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";
import { getDownloadUrl } from "@/lib/r2";

// POST: confirm upload completed
export async function POST(req: Request) {
  const { albumId, guestId, guestToken, r2Key, thumbKey, type, mime, sizeBytes, width, height } = await req.json();

  const supabase = await createClient();
  const tokenHash = hashToken(guestToken);

  const { data: guest } = await supabase
    .from("guests")
    .select("id, album_id")
    .eq("id", guestId)
    .eq("guest_token_hash", tokenHash)
    .single();

  if (!guest || guest.album_id !== albumId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("media")
    .insert({ album_id: albumId, guest_id: guestId, r2_key: r2Key, thumb_key: thumbKey, type, mime, size_bytes: sizeBytes, width, height })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  supabase.from("events").insert({ album_id: albumId, guest_id: guestId, name: "upload_completed" });

  return NextResponse.json({ mediaId: data.id });
}

// GET: list media for an album with signed URLs
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const albumId = searchParams.get("albumId");
  if (!albumId) return NextResponse.json({ error: "Missing albumId" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .select("id, guest_id, r2_key, thumb_key, type, mime, width, height, created_at, guests(name)")
    .eq("album_id", albumId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUrls = await Promise.all(
    (data ?? []).map(async (item) => ({
      ...item,
      url: await getDownloadUrl(item.r2_key),
      thumbUrl: item.thumb_key ? await getDownloadUrl(item.thumb_key) : await getDownloadUrl(item.r2_key),
    }))
  );

  return NextResponse.json(withUrls);
}
