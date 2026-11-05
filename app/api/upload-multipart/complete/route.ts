import { NextResponse } from "next/server";
import { completeMultipartUpload, abortMultipartUpload } from "@/lib/r2";

export async function POST(req: Request) {
  const { r2Key, uploadId, parts, abort } = await req.json();

  if (!r2Key || !uploadId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (abort) {
    await abortMultipartUpload(r2Key, uploadId);
    return NextResponse.json({ ok: true });
  }

  if (!parts?.length) {
    return NextResponse.json({ error: "Missing parts" }, { status: 400 });
  }

  await completeMultipartUpload(r2Key, uploadId, parts);
  return NextResponse.json({ ok: true });
}
