import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDownloadUrl } from "@/lib/r2";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("media")
    .select("r2_key, mime, albums(expires_at)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signedUrl = await getDownloadUrl(item.r2_key, 60);
  const r2Res = await fetch(signedUrl);
  if (!r2Res.ok) return NextResponse.json({ error: "Fetch failed" }, { status: 502 });

  const ext = item.mime.split("/")[1] ?? "jpg";
  const headers = new Headers({
    "Content-Type": item.mime,
    "Content-Disposition": `attachment; filename="nightcap-${id}.${ext}"`,
    "Cache-Control": "private, max-age=3600",
  });

  return new NextResponse(r2Res.body, { headers });
}
