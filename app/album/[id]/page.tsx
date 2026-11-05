"use client";
import { useEffect, useRef, useState } from "react";
import copy from "@/lib/copy";

const c = copy.en;

const ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif","video/mp4","video/quicktime"]);
const ALLOWED_EXT  = new Set(["jpg","jpeg","png","webp","heic","heif","mp4","mov"]);
const MAX_PHOTO = 30  * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;

function inferMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string,string> = { jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif",mp4:"video/mp4",mov:"video/quicktime" };
  return map[ext] ?? "application/octet-stream";
}

function putWithProgress(url: string, body: File|Blob, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error — check your connection"));
    xhr.send(body);
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: Error = new Error("Failed");
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e: any) {
      last = e;
      if (/401|403|not allowed|too large/i.test(e.message ?? "")) throw e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

type Album     = { id: string; name: string; expires_at: string };
type MediaItem = { id: string; guest_id: string; url: string; thumbUrl: string; type: string; mime: string; width?: number; height?: number; created_at: string; guests: { name: string }; };
type UploadItem= { id: string; file: File; status: "waiting"|"uploading"|"done"|"failed"; progress: number; error?: string; };

function generateThumb(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/") || /\.(mov|mp4)$/i.test(file.name)) {
      const video = document.createElement("video");
      video.src = url; video.muted = true; video.playsInline = true;
      const t = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error("Video thumbnail timeout")); }, 15000);
      video.onloadeddata = () => { video.currentTime = 0.5; };
      video.onseeked = () => {
        clearTimeout(t);
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth || 400, 400);
        canvas.height = Math.round(canvas.width * (video.videoHeight||300) / (video.videoWidth||400));
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => { clearTimeout(t); URL.revokeObjectURL(url); reject(new Error("Could not read video")); };
    } else {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(img.naturalWidth, 400);
        canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
      img.src = url;
    }
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(r => r.blob());
}

function fmtSize(bytes: number) {
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const [albumId, setAlbumId]           = useState("");
  const [album, setAlbum]               = useState<Album|null>(null);
  const [name, setName]                 = useState("");
  const [joined, setJoined]             = useState(false);
  const [guestId, setGuestId]           = useState("");
  const [guestToken, setGuestToken]     = useState("");
  const [media, setMedia]               = useState<MediaItem[]>([]);
  const [filter, setFilter]             = useState<string>("all");
  const [uploadItems, setUploadItems]   = useState<UploadItem[]>([]);
  const [lightbox, setLightbox]         = useState<MediaItem|null>(null);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode]     = useState(false);
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [joining, setJoining]           = useState(false);
  const [albumError, setAlbumError]     = useState("");
  const [error, setError]               = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const albumIdRef    = useRef(albumId);
  const guestIdRef    = useRef(guestId);
  const guestTokenRef = useRef(guestToken);
  useEffect(() => { albumIdRef.current    = albumId;    }, [albumId]);
  useEffect(() => { guestIdRef.current    = guestId;    }, [guestId]);
  useEffect(() => { guestTokenRef.current = guestToken; }, [guestToken]);

  const hasActiveUploads = uploadItems.some(i => i.status === "waiting" || i.status === "uploading");

  useEffect(() => {
    if (!hasActiveUploads) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasActiveUploads]);

  useEffect(() => {
    params.then(({ id }) => {
      setAlbumId(id);
      fetch(`/api/albums/${id}`).then(async r => {
        const d = await r.json();
        if (d.error || !r.ok) { setAlbumError(d.error ?? "Album not found"); return; }
        if (new Date(d.expires_at) < new Date()) { setAlbumError("This album has expired"); return; }
        setAlbum(d);
      });
      try {
        const saved = localStorage.getItem(`guest_${id}`);
        if (saved) {
          const { guestId: gid, guestToken: gt, name: n } = JSON.parse(saved);
          setGuestId(gid); setGuestToken(gt); setName(n); setJoined(true);
        }
      } catch {}
    });
  }, [params]);

  useEffect(() => { if (albumId) loadMedia(); }, [albumId]);

  async function loadMedia() {
    const res = await fetch(`/api/media?albumId=${albumIdRef.current}`);
    const data = await res.json();
    if (Array.isArray(data)) setMedia(data);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true); setError("");
    const res = await fetch("/api/guests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId, name }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setJoining(false); return; }
    try { localStorage.setItem(`guest_${albumId}`, JSON.stringify({ guestId: data.guestId, guestToken: data.guestToken, name })); } catch {}
    setGuestId(data.guestId); setGuestToken(data.guestToken); setJoined(true); setJoining(false);
  }

  // ── Upload ────────────────────────────────────────────────────

  function validateFile(file: File): string|null {
    const ext  = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = file.type || inferMime(file.name);
    if (!ALLOWED_MIME.has(mime) && !ALLOWED_EXT.has(ext)) return `${file.name} — unsupported type`;
    const isVideo = mime.startsWith("video/") || ext === "mp4" || ext === "mov";
    if (isVideo  && file.size > MAX_VIDEO) return `${file.name} — too large (max 1 GB)`;
    if (!isVideo && file.size > MAX_PHOTO) return `${file.name} — too large (max 30 MB)`;
    return null;
  }

  async function uploadOne(item: UploadItem) {
    const aid = albumIdRef.current, gid = guestIdRef.current, gt = guestTokenRef.current;
    const file = item.file;
    const mime = file.type || inferMime(file.name);
    const { dataUrl, width, height } = await generateThumb(file);
    const thumbBlob = await dataUrlToBlob(dataUrl);
    const thumbFile = new File([thumbBlob], "thumb.jpg", { type: "image/jpeg" });
    const [urlData, thumbData] = await withRetry(() => Promise.all([
      fetch("/api/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: aid, guestId: gid, guestToken: gt, fileName: file.name, contentType: mime, size: file.size }) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; }),
      fetch("/api/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: aid, guestId: gid, guestToken: gt, fileName: "thumb.jpg", contentType: "image/jpeg", size: thumbFile.size }) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; }),
    ]));
    await withRetry(() => putWithProgress(urlData.uploadUrl, file, mime, (pct) => setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i))));
    await withRetry(() => fetch(thumbData.uploadUrl, { method: "PUT", body: thumbFile, headers: { "Content-Type": "image/jpeg" } }).then(r => { if (!r.ok) throw new Error(`Thumb failed (${r.status})`); }));
    await withRetry(() => fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: aid, guestId: gid, guestToken: gt, r2Key: urlData.r2Key, thumbKey: thumbData.r2Key, type: mime.startsWith("video/") ? "video" : "photo", mime, sizeBytes: file.size, width, height }) }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? r.statusText); return d; }));
  }

  async function runUpload(item: UploadItem) {
    setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "uploading", progress: 0, error: undefined } : i));
    try {
      await uploadOne(item);
      setUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "done", progress: 100 } : i));
      loadMedia();
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

  async function retryItem(itemId: string) {
    const item = uploadItems.find(i => i.id === itemId);
    if (item) await runUpload({ ...item, status: "waiting", progress: 0, error: undefined });
  }

  // ── Download / share ──────────────────────────────────────────

  async function downloadSingle(item: MediaItem) {
    const proxyUrl = `/api/download/${item.id}`;
    const ext = item.mime.split("/")[1] ?? "jpg";
    const filename = `nightcap-${item.id}.${ext}`;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare) {
      try {
        const blob = await fetch(proxyUrl).then(r => r.blob());
        const file = new File([blob], filename, { type: item.mime });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      } catch {}
    }
    const a = document.createElement("a"); a.href = proxyUrl; a.download = filename; a.click();
  }

  async function saveSelected() {
    const toSave = media.filter(m => selected.has(m.id));
    if (!toSave.length) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare) {
      try {
        const files = await Promise.all(toSave.map(async item => {
          const blob = await fetch(`/api/download/${item.id}`).then(r => r.blob());
          const ext  = item.mime.split("/")[1] ?? "jpg";
          return new File([blob], `nightcap-${item.id}.${ext}`, { type: item.mime });
        }));
        if (navigator.canShare({ files })) {
          await navigator.share({ files });
          setSelectMode(false); setSelected(new Set());
          return;
        }
      } catch {}
    }
    // Desktop: download each individually
    for (const item of toSave) await downloadSingle(item);
    setSelectMode(false); setSelected(new Set());
  }

  async function saveOthers() {
    const others = media.filter(m => m.guest_id !== guestId);
    if (!others.length) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare) {
      try {
        const files = await Promise.all(others.map(async item => {
          const blob = await fetch(`/api/download/${item.id}`).then(r => r.blob());
          const ext  = item.mime.split("/")[1] ?? "jpg";
          return new File([blob], `nightcap-${item.id}.${ext}`, { type: item.mime });
        }));
        if (navigator.canShare({ files })) { await navigator.share({ files }); return; }
      } catch {}
    }
    for (const item of others) await downloadSingle(item);
  }

  async function deleteMedia(mediaId: string) {
    await fetch(`/api/media/${mediaId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestId, guestToken }) });
    setMedia(prev => prev.filter(m => m.id !== mediaId));
    setLightbox(null);
  }

  async function reportMedia(mediaId: string) {
    await fetch(`/api/media/${mediaId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "inappropriate" }) });
    setLightbox(null);
  }

  function robustCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.top = "-9999px"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(el);
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  function copyInviteLink() {
    robustCopy(`${window.location.origin}/album/${albumId}`);
    setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const uploaders   = Array.from(new Map(media.map(m => [m.guest_id, m.guests?.name ?? "?"])).entries());
  const filtered    = filter === "all" ? media : filter === "mine" ? media.filter(m => m.guest_id === guestId) : media.filter(m => m.guest_id === filter);
  const othersCount = media.filter(m => m.guest_id !== guestId).length;
  const failedCount = uploadItems.filter(i => i.status === "failed").length;
  const isMobileUA  = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ── Error screen ─────────────────────────────────────────────
  if (albumError) return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>📭</p>
      <h1 className="display" style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>{albumError}</h1>
      <p style={{ color: "var(--muted)" }}>This link may have expired or been removed.</p>
    </main>
  );

  // ── Join screen ───────────────────────────────────────────────
  if (!joined) return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "2rem 1.5rem 3rem" }}>
      <div>
        <span className="display" style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "var(--muted)" }}>NightCap</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480, width: "100%", paddingTop: "3rem" }}>
        {album && <p style={{ color: "var(--muted)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>{album.name}</p>}
        <h1 className="display" style={{ fontSize: "clamp(2.5rem, 9vw, 4rem)", lineHeight: 1, marginBottom: "2rem" }}>{c.join.headline}</h1>
        <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input type="text" placeholder={c.join.placeholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", padding: "1rem 1.25rem", borderRadius: "0.75rem", fontSize: "1.2rem", outline: "none" }} />
          {error && <p style={{ color: "#ff5555", fontSize: "0.9rem" }}>{error}</p>}
          <button type="submit" disabled={!name.trim() || joining}
            style={{ background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "1rem", borderRadius: "0.75rem", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", opacity: !name.trim() || joining ? 0.4 : 1 }}>
            {joining ? "Joining…" : c.join.cta}
          </button>
        </form>
      </div>
    </main>
  );

  // ── Album view ────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100dvh", paddingBottom: "5rem" }}>

      {/* Header */}
      <div style={{ padding: "0.75rem 1rem 0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="display" style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "var(--muted)" }}>NightCap</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button onClick={() => setShowInvite(v => !v)}
            style={{ padding: "0.35rem 0.75rem", borderRadius: "2rem", fontSize: "0.8rem", fontWeight: 600, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>
            Invite & save link
          </button>
          <button onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
            style={{ padding: "0.35rem 0.75rem", borderRadius: "2rem", fontSize: "0.8rem", fontWeight: 600, border: selectMode ? "1px solid var(--accent)" : "1px solid var(--border)", background: selectMode ? "var(--accent)" : "transparent", color: selectMode ? "var(--accent-fg)" : "var(--muted)", cursor: "pointer" }}>
            {selectMode ? "Cancel" : "Select"}
          </button>
        </div>
      </div>

      {/* Album name + stats */}
      <div style={{ padding: "0 1rem 0.75rem" }}>
        <h1 className="display" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{album?.name}</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
          {media.length} {media.length === 1 ? "photo" : "photos"} · {new Set(media.map(m => m.guest_id)).size} people
        </p>
      </div>

      {/* Invite panel */}
      {showInvite && (
        <div style={{ margin: "0 1rem 0.75rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem" }}>
          <button onClick={copyInviteLink}
            style={{ width: "100%", background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "0.75rem", borderRadius: "0.5rem", fontWeight: 700, cursor: "pointer", marginBottom: "0.6rem" }}>
            {inviteCopied ? "Copied!" : "Copy link"}
          </button>
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.4 }}>
            Send this to friends to invite them — or <strong style={{ color: "rgba(255,255,255,0.6)" }}>bookmark it yourself</strong> so you can come back later.
          </p>
        </div>
      )}

      {/* Upload queue */}
      {uploadItems.length > 0 && (
        <div style={{ background: "var(--card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: "0.5rem" }}>
          {hasActiveUploads && (
            <div style={{ padding: "0.5rem 1rem", background: "#1a1200", borderBottom: "1px solid var(--border)", fontSize: "0.8rem", color: "#ffcc44" }}>
              ⚠️ Keep this page open while uploading
            </div>
          )}
          {failedCount > 1 && (
            <div style={{ padding: "0.4rem 1rem", display: "flex", justifyContent: "flex-end", borderBottom: "1px solid var(--border)" }}>
              <button onClick={async () => { const failed = uploadItems.filter(i => i.status === "failed"); for (const item of failed) await retryItem(item.id); }}
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
                  <button onClick={() => retryItem(item.id)}
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

      {/* Filters — scrollable row */}
      <div style={{ padding: "0 1rem 0.75rem", display: "flex", gap: "0.4rem", overflowX: "auto" }}>
        {(["all","mine"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "0.35rem 0.85rem", borderRadius: "2rem", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", border: filter === f ? "1.5px solid #fff" : "1px solid var(--border)", background: "transparent", color: filter === f ? "#fff" : "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {f === "all" ? "Everyone" : "Mine"}
          </button>
        ))}
        {uploaders.filter(([id]) => id !== guestId).map(([id, uname]) => (
          <button key={id} onClick={() => setFilter(filter === id ? "all" : id)}
            style={{ padding: "0.35rem 0.85rem", borderRadius: "2rem", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", border: filter === id ? "1.5px solid #fff" : "1px solid var(--border)", background: "transparent", color: filter === id ? "#fff" : "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
            {uname}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--muted)" }}>
          <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📸</p>
          <p>No pics yet. Be the first.</p>
        </div>
      ) : (
        <div className="nc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px" }}>
          {filtered.map(item => {
            const isSel = selected.has(item.id);
            return (
              <div key={item.id}
                onClick={() => selectMode ? toggleSelect(item.id) : setLightbox(item)}
                style={{ aspectRatio: "1", overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--card)" }}>
                <img src={item.thumbUrl} alt={item.guests?.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {item.type === "video" && !isSel && (
                  <div style={{ position: "absolute", bottom: "0.35rem", right: "0.35rem", background: "rgba(0,0,0,0.6)", borderRadius: "0.2rem", padding: "0.1rem 0.3rem", fontSize: "0.65rem" }}>▶</div>
                )}
                {/* Name label */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.65))", padding: "0.75rem 0.3rem 0.25rem", fontSize: "0.62rem", color: "rgba(255,255,255,0.85)", lineHeight: 1 }}>
                  {item.guests?.name}
                </div>
                {/* Select overlay */}
                {selectMode && (
                  <div style={{ position: "absolute", inset: 0, background: isSel ? "rgba(180,210,80,0.2)" : "transparent", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "0.4rem" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSel ? "var(--accent)" : "rgba(255,255,255,0.7)"}`, background: isSel ? "var(--accent)" : "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#000" }}>
                      {isSel && "✓"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "2rem 1rem 1rem", textAlign: "center" }}>
        <a href="/" style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.78rem", textDecoration: "none" }}>
          Make your own album →
        </a>
      </div>

      {/* Fixed bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "0.75rem 1rem", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))", background: "rgba(10,10,10,0.92)", borderTop: "1px solid var(--border)", backdropFilter: "blur(12px)", display: "flex", gap: "0.5rem", zIndex: 40 }}>
        {selectMode ? (
          <>
            <button onClick={saveOthers} disabled={othersCount === 0}
              style={{ flex: 1, padding: "0.75rem", borderRadius: "0.6rem", border: "1px solid var(--border)", background: "transparent", color: othersCount === 0 ? "var(--muted)" : "var(--fg)", fontWeight: 600, fontSize: "0.88rem", cursor: othersCount === 0 ? "default" : "pointer" }}>
              Save theirs ({othersCount})
            </button>
            <button onClick={saveSelected} disabled={selected.size === 0}
              style={{ flex: 1, padding: "0.75rem", borderRadius: "0.6rem", border: "none", background: selected.size === 0 ? "rgba(180,210,80,0.3)" : "var(--accent)", color: selected.size === 0 ? "var(--muted)" : "var(--accent-fg)", fontWeight: 700, fontSize: "0.88rem", cursor: selected.size === 0 ? "default" : "pointer" }}>
              {selected.size > 0 ? `Save ${selected.size}` : "Select photos"}
            </button>
          </>
        ) : (
          <label style={{ flex: 1, background: "var(--accent)", color: "var(--accent-fg)", padding: "0.85rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "1rem", cursor: "pointer", textAlign: "center", display: "block" }}>
            {c.upload.cta}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
              onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          </label>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600 }}>
            {lightbox.type === "video" ? (
              <video src={lightbox.url} poster={lightbox.thumbUrl} controls autoPlay playsInline preload="metadata"
                style={{ width: "100%", borderRadius: "0.5rem" }} />
            ) : (
              (() => {
                const isHEIC = lightbox.mime === "image/heic" || lightbox.mime === "image/heif";
                const isIOS  = /iPad|iPhone|iPod/.test(navigator.userAgent);
                return <img src={(isHEIC && !isIOS) ? lightbox.thumbUrl : lightbox.url} alt="" style={{ width: "100%", borderRadius: "0.5rem", maxHeight: "70vh", objectFit: "contain" }} />;
              })()
            )}
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", marginTop: "0.5rem" }}>by {lightbox.guests?.name}</p>
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => downloadSingle(lightbox)}
                style={{ padding: "0.6rem 1.2rem", borderRadius: "0.5rem", background: "var(--accent)", color: "var(--accent-fg)", border: "none", fontWeight: 700, cursor: "pointer" }}>
                {isMobileUA ? "Save to Photos" : "Download"}
              </button>
              {lightbox.guest_id === guestId && (
                <button onClick={() => deleteMedia(lightbox.id)}
                  style={{ padding: "0.6rem 1.2rem", borderRadius: "0.5rem", background: "var(--card)", color: "#ff5555", border: "1px solid var(--border)", cursor: "pointer" }}>
                  Delete
                </button>
              )}
              {lightbox.guest_id !== guestId && (
                <button onClick={() => reportMedia(lightbox.id)}
                  style={{ padding: "0.6rem 1.2rem", borderRadius: "0.5rem", background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                  Report
                </button>
              )}
              <button onClick={() => setLightbox(null)}
                style={{ padding: "0.6rem 1.2rem", borderRadius: "0.5rem", background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 768px)  { .nc-grid { grid-template-columns: repeat(5, 1fr) !important; } }
        @media (min-width: 1200px) { .nc-grid { grid-template-columns: repeat(6, 1fr) !important; } }
      `}</style>
    </main>
  );
}
