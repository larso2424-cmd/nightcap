import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { guestId, guestToken } = await req.json();

  const supabase = await createClient();
  const tokenHash = hashToken(guestToken);

  const { data: guest } = await supabase
    .from("guests").select("id").eq("id", guestId).eq("guest_token_hash", tokenHash).single();
  if (!guest) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("guest_id", guestId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
