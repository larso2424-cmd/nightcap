import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const albumId = generateToken(10);
  const hostToken = generateToken(20);
  const hostTokenHash = hashToken(hostToken);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("albums").insert({
    id: albumId,
    name: name.trim(),
    host_token_hash: hostTokenHash,
    user_id: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log event (fire and forget)
  supabase.from("events").insert({ album_id: albumId, name: "album_created" });

  return NextResponse.json({ albumId, hostToken });
}
