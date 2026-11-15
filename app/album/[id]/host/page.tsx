"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import copy from "@/lib/copy";
import { ALLOWED_MIME, ALLOWED_EXT, MAX_PHOTO, MAX_VIDEO, inferMime, putWithProgress, withRetry, generateThumb, dataUrlToBlob, fmtSize, type UploadItem } from "@/lib/upload";

const c = copy.en;
type Album = { id: string; name: string; expires_at: string; user_id: string };
type MediaItem = { id: string; guest_id: string; thumbUrl: string; url: string; type: string; mime: string; guests: { name: string }; report_count: number };

export default function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const [albumId, setAlbumId] = useState("");
  const [album, setAlbum] = useState<Album | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [hostToken, setHostToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedGuest, setCopiedGuest] = useState(false);
  const [tab, setTab] = useState<"qr" | "grid">("qr");
  const [guestUrl, setGuestUrl] = useState("");

  // Host's own upload guest session
  const [hostGuestId, setHostGuestId] = useState("");
  const [hostGuestToken, setHostGuestToken] = useState("");
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState(false);
  const albumIdRef = useRef("");
  const hostGuestIdRef = useRef("");
  const hostGuestTokenRef = useRef("");

  useEffect(() => { albumIdRef.current = albumId; }, [albumId]);
  useEffect(() => { hostGuestIdRef.current = hostGuestId; }, [hostGuestId]);
  useEffect(() => { hostGuestTokenRef.current = hostGuestToken; }, [hostGuestToken]);

  useEffect(() => {
    if (albumId) setGuestUrl(`${window.location.origin}/album/${albumId}`);
  }, [albumId]);

  useEffect(() => {
    params.then(async ({ id }) => {
      setAlbumId(id);

      // Try localStorage token first
      const urlToken = new URLSearchParams(window.location.search).get("token") ?? "";
      let token = "";
      try {
        if (urlToken) { localStorage.setItem(`host_token_${id}`, urlToken); token = urlToken; }
        else { token = localStorage.getItem(`host_token_${id}`) ?? ""; }
      } catch { if (urlToken) token = urlToken; }

      // Fall back to session ownership check
      if (!token) {
        const [sessionData, albumData] = await Promise.all([
          fetch("/api/auth/session").then(r => r.json()),
          fetch(`/api/albums/${id}`).then(r => r.json()),
        ]);
        if (!albumData.error) setAlbum(albumData);
        if (sessionData.user?.id && albumData.user_id === sessionData.user.id) {
          token = "__owner__";
        }
      } else {
        fetch(`/api/albums/${id}`).then(r => r.json()).then(d => { if (!d.error) setAlbum(d); });
      }

      setHostToken(token);
      fetch(`/api/media?albumId=${id}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setMedia(d); });

      // Restore host guest session for uploads
      try {
        const saved = localStorage.getItem(`host_guest_${id}`);
        if (saved) {
          const { guestId: gid, guestToken: gt } = JSON.parse(saved);
          setHostGuestId(gid); setHostGuestToken(gt);
        }
      } catch {}
    });
  }, [params]);

  async function ensureHostGuest(): Promise<{ guestId: string; guestToken: string }> {
    if (hostGuestIdRef.current && hostGuestTokenRef.current) {
      return { guestId: hostGuestIdRef.current, guestToken: hostGuestTokenRef.current };
    }
    // Create a guest entry for the host
    const sessionData = await fetch("/api/auth/session").then(r => r.json());
    const displayName = sessionData.user?.email?.split("@")[0] ?? "Host";
    const res = await fetch("/api/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId: albumIdRef.current, name: displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not create host guest");
    try { localStorage.setItem(`host_guest_${albumIdRef.current}`, JSON.stringify({ guestId: data.guestId, guestToken: data.guestToken })); } catch {}
    setHostGuestId(data.guestId); setHostGuestToken(data.guestToken);
    return { guestId: data.guestId, guestToken: data.guestToken };
  }

  function validateFile(file: File): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = file.type || inferMime(file.name);
    if (!ALLOWED_MIME.has(mime) && !ALLOWED_EXT.has(ext)) return `${file.name} — unsupported type`;
    const isVideo = mime.startsWith("video/") || ext === "mp4" || ext === "mov";
    if (isVideo && file.size > MAX_VIDEO) return `${file.name} — too large (max 1 GB)`;
    if (!isVideo && file.size > MAX_PHOTO) return `${file.name} — too large (max 30 MB)`;
    return null;
  }

  async function uploadOne(item: UploadItem, guestId: string, guestToken: string) {
    const aid = albumIdRef.current;
    const file = item.file;
    const mime = file.type || inferMime(file.name);
    const isVideo = mime.startsWith("video/");

    const { dataUrl, width, height } = await generateThumb(file);
    const thumbBlob = await dataUrlToBlob(dataUrl);
    const thumbFile = new File([thumbBlob], "thumb.jpg", { type: "image/jpeg" });

    const thumbData = await withRetry(() =>
      fetch("/api/upload-url", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: aid, guestId, guestToken, fileName: "thumb.jpg", contentType: "image/jpeg", size: thumbFile.size }) })
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; })
    );
    await withRetry(() => fetch(thumbData.uploadUrl, { method: "PUT", body: thumbFile, headers: { "Content-Type": "image/jpeg" } }).then(r => { if (!r.ok) throw new Error(`Thumb failed (${r.status})`); }));

    let r2Key: string;

    if (isVideo && file.size > 5 * 1024 * 1024) {
      const initData = await withRetry(() =>
        fetch("/api/upload-multipart/init", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: aid, guestId, guestToken, fileName: file.name, contentType: mime, size: file.size }) })
          .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; })
      );
      r2Key = initData.r2Key;
      const { uploadId, partUrls, partSize } = initData;
      const parts: { ETag: string; PartNumber: number }[] = [];
      let uploaded = 0;
      for (let i = 0; i < partUrls.length; i++) {
        const start = i * partSize;
        const chunk = file.slice(start, start + partSize);
        const etag = await withRetry(() => new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", partUrls[i]);
          xhr.setRequestHeader("Content-Type", mime);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const partLoaded = uploaded + e.loaded;
              setUploadItems(prev => prev.map(it => it.id === item.id ? { ...it, progress: Math.round(partLoaded / file.size * 100) } : it));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) { uploaded += chunk.size; resolve(xhr.getResponseHeader("ETag") ?? ""); }
            else reject(new Error(`Part ${i + 1} failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("Network error on part " + (i + 1)));
          xhr.send(chunk);
        }));
        parts.push({ PartNumber: i + 1, ETag: etag });
      }
      await fetch("/api/upload-multipart/complete", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r2Key, uploadId, parts }) });
    } else {
      const urlData = await withRetry(() =>
        fetch("/api/upload-url", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: aid, guestId, guestToken, fileName: file.name, contentType: mime, size: file.size }) })
          .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; })
      );
      r2Key = urlData.r2Key;
      await withRetry(() => putWithProgress(urlData.uploadUrl, file, mime, (pct) => setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i))));
    }

    await withRetry(() => fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId: aid, guestId, guestToken, r2Key, thumbKey: thumbData.r2Key, type: isVideo ? "video" : "photo", mime, sizeBytes: file.size, width, height }) })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; }));
  }

  async function runUpload(item: UploadItem) {
    setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "uploading", progress: 0, error: undefined } : i));
    try {
      const { guestId, guestToken } = await ensureHostGuest();
      await uploadOne(item, guestId, guestToken);
      setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "done", progress: 100 } : i));
      fetch(`/api/media?albumId=${albumIdRef.current}`).then(r => r.json()).then(d => { if (Array.isArray(d)) setMedia(d); });
    } catch (e: any) {
      setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "failed", error: e.message ?? "Upload failed" } : i));
    }
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    const good: UploadItem[] = [], bad: string[] = [];
    for (const file of Array.from(files)) {
      const err = validateFile(file);
      if (err) bad.push(err); else good.push({ id: `${Date.now()}-${Math.random()}`, file, status: "waiting", progress: 0 });
    }
    if (bad.length) alert(bad.join("\n"));
    if (!good.length) return;
    setUploadItems(prev => [...prev, ...good]);
    for (const item of good) await runUpload(item);
  }

  function daysUntil(dateStr: string) {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  }

  function robustCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed"; el.style.top = "-9999px"; el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(el);
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function copyGuestLink() {
    robustCopy(`${window.location.origin}/album/${albumId}`);
    setCopiedGuest(true); setTimeout(() => setCopiedGuest(false), 2000);
  }

  function copyHostLink() {
    robustCopy(`${window.location.origin}/album/${albumId}/host`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  async function deleteMedia(mediaId: string) {
    if (!confirm("Remove this photo from the album?")) return;
    await fetch(`/api/media/${mediaId}/host-delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId, hostToken: hostToken === "__owner__" ? null : hostToken, useOwnerAuth: hostToken === "__owner__" }),
    });
    setMedia(prev => prev.filter(m => m.id !== mediaId));
  }

  async function downloadAll() {
    if (!media.length) return;
    setDownloading(true);
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS && navigator.canShare) {
        const blobs = await Promise.all(media.map(item => fetch(`/api/download/${item.id}`).then(r => r.blob())));
        const files = blobs.map((blob, i) => {
          const item = media[i];
          const ext = item.mime.split("/")[1] ?? "jpg";
          return new File([blob], `nightcap-${item.id}.${ext}`, { type: item.mime });
        });
        if (navigator.canShare({ files })) { navigator.share({ files }); return; }
      }
      for (const item of media) {
        const ext = item.mime.split("/")[1] ?? "jpg";
        const a = document.createElement("a");
        a.href = `/api/download/${item.id}`;
        a.download = `nightcap-${item.id}.${ext}`;
        a.click();
        await new Promise(r => setTimeout(r, 300));
      }
    } finally { setDownloading(false); }
  }

  const hasActiveUploads = uploadItems.some(i => i.status === "waiting" || i.status === "uploading");
  const failedCount = uploadItems.filter(i => i.status === "failed").length;
  const guests = new Set(media.map(m => m.guest_id)).size;
  const uploaders = new Set(media.filter(m => m.thumbUrl).map(m => m.guest_id)).size;

  if (albumId && !hostToken) return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <p style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>🔒</p>
      <h1 className="display" style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>Host access not found</h1>
      <p style={{ color: "var(--muted)", maxWidth: 320 }}>This device doesn't have your host key saved. Open the host link on the device you used to create this album.</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100dvh", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ padding: "1.25rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="display" style={{ fontSize: "1.4rem" }}>{album?.name ?? "…"}</h1>
          {album && <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.2rem" }}>{c.host.expiresIn(daysUntil(album.expires_at))}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["qr", "grid"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "0.5rem 0.9rem", borderRadius: "0.5rem", border: "none", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer", background: tab === t ? "var(--accent)" : "var(--card)", color: tab === t ? "var(--accent-fg)" : "var(--muted)" }}>
              {t === "qr" ? "QR" : "Photos"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "0.75rem 1rem", display: "flex", gap: "1.5rem", borderBottom: "1px solid var(--border)" }}>
        {[["Guests", guests], ["Uploaded", uploaders], ["Photos", media.length]].map(([label, val]) => (
          <div key={label as string}>
            <p className="display" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{val}</p>
            <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Upload queue */}
      {uploadItems.length > 0 && (
        <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
          {hasActiveUploads && (
            <div style={{ padding: "0.5rem 1rem", background: "#1a1200", borderBottom: "1px solid var(--border)", fontSize: "0.8rem", color: "#ffcc44" }}>
              ⚠️ Keep this page open while uploading
            </div>
          )}
          {failedCount > 1 && (
            <div style={{ padding: "0.4rem 1rem", display: "flex", justifyContent: "flex-end", borderBottom: "1px solid var(--border)" }}>
              <button onClick={async () => { const failed = uploadItems.filter(i => i.status === "failed"); for (const item of failed) await runUpload(item); }}
                style={{ fontSize: "0.8rem", fontWeight: 700, color: "#ff5555", background: "transparent", border: "1px solid #ff5555", borderRadius: "0.4rem", padding: "0.25rem 0.6rem", cursor: "pointer" }}>
                Retry all ({failedCount})
              </button>
            </div>
          )}
          {uploadItems.map(item => (
            <div key={item.id} style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ flex: 1, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: item.status === "failed" ? "#ff5555" : "var(--fg)" }}>
                  {item.status === "done" ? "✓ " : item.status === "failed" ? "✗ " : ""}{item.file.name}
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--muted)", flexShrink: 0 }}>{fmtSize(item.file.size)}</span>
                {item.status === "uploading" && <span style={{ fontSize: "0.72rem", color: "var(--accent)", flexShrink: 0 }}>{item.progress}%</span>}
                {item.status === "waiting"   && <span style={{ fontSize: "0.72rem", color: "var(--muted)", flexShrink: 0 }}>Waiting…</span>}
                {item.status === "done"      && <span style={{ fontSize: "0.72rem", color: "#55cc55", flexShrink: 0 }}>Done</span>}
                {item.status === "failed" && (
                  <button onClick={() => runUpload(item)}
                    style={{ fontSize: "0.72rem", fontWeight: 700, color: "#ff5555", background: "transparent", border: "1px solid #ff5555", borderRadius: "0.3rem", padding: "0.1rem 0.4rem", cursor: "pointer", flexShrink: 0 }}>
                    Retry
                  </button>
                )}
              </div>
              {item.status === "uploading" && (
                <div style={{ marginTop: "0.3rem", height: 2, background: "var(--border)", borderRadius: 1 }}>
                  <div style={{ height: "100%", width: `${item.progress}%`, background: "var(--accent)", borderRadius: 1, transition: "width 0.2s" }} />
                </div>
              )}
              {item.status === "failed" && item.error && <p style={{ fontSize: "0.72rem", color: "#ff5555", marginTop: "0.15rem" }}>{item.error}</p>}
            </div>
          ))}
          {!hasActiveUploads && uploadItems.some(i => i.status === "done") && (
            <div style={{ padding: "0.4rem 1rem", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setUploadItems(prev => prev.filter(i => i.status !== "done"))}
                style={{ fontSize: "0.78rem", color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer" }}>
                Clear done
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "qr" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem", padding: "2rem 1.5rem" }}>
          {guestUrl && (
            <div style={{ background: "#fff", padding: "1.25rem", borderRadius: "1rem" }}>
              <QRCode value={guestUrl} size={220} />
            </div>
          )}
          <p className="display" style={{ fontSize: "1.5rem" }}>{c.host.scanPrompt}</p>
          <button onClick={copyGuestLink}
            style={{ width: "100%", maxWidth: 360, background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "0.85rem", borderRadius: "0.75rem", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
            {copiedGuest ? "Copied!" : "Copy invite link"}
          </button>
          <div style={{ width: "100%", maxWidth: 360, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>⚠️ {c.host.saveLinkWarning}</p>
            <button onClick={copyHostLink}
              style={{ background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "0.75rem", borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer" }}>
              {copied ? c.host.copied : c.host.copyLink}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
            {media.length > 0 && (
              <button onClick={downloadAll} disabled={downloading}
                style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent)", background: "transparent", border: "1px solid var(--accent)", borderRadius: "0.5rem", padding: "0.35rem 0.85rem", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.5 : 1 }}>
                {downloading ? "Saving…" : /iPad|iPhone|iPod/.test(typeof navigator !== "undefined" ? navigator.userAgent : "") ? `Save all to Photos` : `Download all (${media.length})`}
              </button>
            )}
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-fg)", background: "var(--accent)", border: "none", borderRadius: "0.5rem", padding: "0.35rem 0.85rem", cursor: "pointer" }}>
              Add photos
              <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} ref={fileInputRef}
                onChange={(e) => e.target.files && handleFiles(e.target.files)} />
            </label>
          </div>
          {media.filter(m => m.report_count > 0).length > 0 && (
            <div style={{ padding: "0.75rem 1rem", background: "#2a1a00", borderBottom: "1px solid var(--border)", fontSize: "0.85rem", color: "#ffaa00" }}>
              ⚠️ {media.filter(m => m.report_count > 0).length} reported item(s) — review below
            </div>
          )}
          {media.length === 0 ? (
            <p style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>No photos yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px" }}>
              {media.map(item => (
                <div key={item.id} style={{ aspectRatio: "1", overflow: "hidden", position: "relative", background: "var(--card)" }}>
                  <img src={item.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {item.report_count > 0 && (
                    <div style={{ position: "absolute", top: "0.3rem", left: "0.3rem", background: "#ffaa00", borderRadius: "0.25rem", padding: "0.1rem 0.3rem", fontSize: "0.65rem", color: "#000", fontWeight: 700 }}>
                      REPORTED
                    </div>
                  )}
                  <button onClick={() => deleteMedia(item.id)}
                    style={{ position: "absolute", top: "0.3rem", right: "0.3rem", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", borderRadius: "0.25rem", padding: "0.2rem 0.4rem", fontSize: "0.7rem", cursor: "pointer" }}>
                    ✕
                  </button>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.7))", padding: "0.5rem 0.4rem 0.3rem", fontSize: "0.7rem", color: "#fff" }}>
                    {item.guests?.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
