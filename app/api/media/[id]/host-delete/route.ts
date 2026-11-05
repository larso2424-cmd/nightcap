import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { albumId, hostToken, useOwnerAuth } = await req.json();

  const supabase = await createClient();
  let authorized = false;

  if (useOwnerAuth) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: album } = await supabase
        .from("albums").select("id").eq("id", albumId).eq("user_id", user.id).single();
      authorized = !!album;
    }
  } else {
    const tokenHash = hashToken(hostToken);
    const { data: album } = await supabase
      .from("albums").select("id").eq("id", albumId).eq("host_token_hash", tokenHash).single();
    authorized = !!album;
  }

  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("media").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("album_id", albumId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
