import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { reason } = await req.json();

  const supabase = await createClient();

  await Promise.all([
    supabase.from("reports").insert({ media_id: id, reason }),
    supabase.from("media").update({ report_count: supabase.rpc("increment_report_count", { media_id: id }) }).eq("id", id),
  ]);

  return NextResponse.json({ ok: true });
}
