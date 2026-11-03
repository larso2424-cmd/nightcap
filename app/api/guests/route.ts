import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";

export async function POST(req: Request) {
  const { albumId, name } = await req.json();
  if (!albumId || !name?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .is("deleted_at", null)
    .single();

  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

  const guestToken = generateToken(20);
  const guestTokenHash = hashToken(guestToken);

  const { data, error } = await supabase
    .from("guests")
    .insert({ album_id: albumId, name: name.trim(), guest_token_hash: guestTokenHash })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  supabase.from("events").insert({ album_id: albumId, guest_id: data.id, name: "guest_joined" });

  return NextResponse.json({ guestId: data.id, guestToken });
}
