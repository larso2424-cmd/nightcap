import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { reason } = await req.json();

  const supabase = await createClient();

  const [{ data: existing }] = await Promise.all([
    supabase.from("media").select("report_count").eq("id", id).single(),
    supabase.from("reports").insert({ media_id: id, reason }),
  ]);
  if (existing) {
    await supabase.from("media").update({ report_count: (existing.report_count ?? 0) + 1 }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
