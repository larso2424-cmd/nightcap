"use client";
import { useEffect, useRef, useState } from "react";
import copy from "@/lib/copy";

const c = copy.en;

type Album = { id: string; name: string };
type MediaItem = {
  id: string; guest_id: string; url: string; thumbUrl: string;
  type: string; mime: string; width?: number; height?: number;
  created_at: string; guests: { name: string };
};

function generateThumb(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        video.currentTime = 0.5;
      };
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 400);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: video.videoWidth, height: video.videoHeight });
        URL.revokeObjectURL(url);
      };
    } else {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(img.naturalWidth, 400);
        canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const [albumId, setAlbumId] = useState("");
  const [album, setAlbum] = useState<Album | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [guestToken, setGuestToken] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setAlbumId(id);
      fetch(`/api/albums/${id}`).then(r => r.json()).then(d => {
        if (d.error) return;
        setAlbum(d);
      });
      // Restore guest session
      try {
        const saved = localStorage.getItem(`guest_${id}`);
        if (saved) {
          const { guestId: gid, guestToken: gt, name: n } = JSON.parse(saved);
          setGuestId(gid); setGuestToken(gt); setName(n); setJoined(true);
        }
      } catch {}
    });
  }, [params]);

  useEffect(() => {
    if (!albumId) return;
    loadMedia();
  }, [albumId]);

  async function loadMedia() {
    const res = await fetch(`/api/media?albumId=${albumId}`);
    const data = await res.json();
    if (Array.isArray(data)) setMedia(data);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true); setError("");
    const res = await fetch("/api/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId, name }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setJoining(false); return; }
    try {
      localStorage.setItem(`guest_${albumId}`, JSON.stringify({ guestId: data.guestId, guestToken: data.guestToken, name }));
    } catch {}
    setGuestId(data.guestId); setGuestToken(data.guestToken); setJoined(true); setJoining(false);
  }

  async function handleFiles(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    const total = files.length;
    setUploadProgress({ done: 0, total });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Generate thumbnail
        const { dataUrl, width, height } = await generateThumb(file);
        const thumbBlob = await dataUrlToBlob(dataUrl);
        const thumbFile = new File([thumbBlob], "thumb.jpg", { type: "image/jpeg" });

        // Get upload URLs
        const [urlRes, thumbUrlRes] = await Promise.all([
          fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ albumId, guestId, guestToken, fileName: file.name, contentType: file.type, size: file.size }),
          }),
          fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ albumId, guestId, guestToken, fileName: "thumb.jpg", contentType: "image/jpeg", size: thumbFile.size }),
          }),
        ]);

        const { uploadUrl, r2Key } = await urlRes.json();
        const { uploadUrl: thumbUploadUrl, r2Key: thumbKey } = await thumbUrlRes.json();

        // Upload both in parallel
        await Promise.all([
          fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } }),
          fetch(thumbUploadUrl, { method: "PUT", body: thumbFile, headers: { "Content-Type": "image/jpeg" } }),
        ]);

        // Confirm upload
        await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            albumId, guestId, guestToken, r2Key, thumbKey,
            type: file.type.startsWith("video/") ? "video" : "photo",
            mime: file.type, sizeBytes: file.size, width, height,
          }),
        });

        setUploadProgress({ done: i + 1, total });
      } catch (err) {
        console.error("Upload failed for", file.name, err);
      }
    }

    setUploading(false);
    loadMedia();
  }

  async function downloadSingle(item: MediaItem) {
    const proxyUrl = `/api/download/${item.id}`;
    const ext = item.mime.split("/")[1] ?? "jpg";
    const filename = `nightcap-${item.id}.${ext}`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // On mobile: use Web Share API → native "Save to Photos" / "Save to Gallery" sheet
    if (isMobile && navigator.canShare) {
      try {
        const blob = await fetch(proxyUrl).then(r => r.blob());
        const file = new File([blob], filename, { type: item.mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch {}
    }

    // Desktop: anchor download → Finder / Downloads folder
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename;
    a.click();
  }

  async function downloadOthers() {
    const others = media.filter(m => m.guest_id !== guestId);
    if (!others.length) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile && navigator.canShare?.({ files: [new File([], "test")] })) {
      try {
        const files = await Promise.all(others.map(async (item) => {
          const blob = await fetch(`/api/download/${item.id}`).then(r => r.blob());
          return new File([blob], `nightcap-${item.id}.${item.mime.split("/")[1] ?? "jpg"}`, { type: item.mime });
        }));
        await navigator.share({ files, title: album?.name });
        return;
      } catch {}
    }

    // Fallback: download individually
    for (const item of others) await downloadSingle(item);
  }

  async function deleteMedia(mediaId: string) {
    await fetch(`/api/media/${mediaId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestId, guestToken }),
    });
    setMedia(prev => prev.filter(m => m.id !== mediaId));
    setLightbox(null);
  }

  async function reportMedia(mediaId: string) {
    await fetch(`/api/media/${mediaId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "inappropriate" }),
    });
    setLightbox(null);
  }

  const filtered = filter === "mine" ? media.filter(m => m.guest_id === guestId) : media;

  // Join screen
  if (!joined) {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem 3rem" }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          {album && <p style={{ color: "var(--muted)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>{album.name}</p>}
          <h1 className="display" style={{ fontSize: "clamp(2.5rem, 9vw, 4rem)", lineHeight: 1, marginBottom: "2rem" }}>
            {c.join.headline}
          </h1>
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              type="text" placeholder={c.join.placeholder} value={name}
              onChange={(e) => setName(e.target.value)} autoFocus
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", padding: "1rem 1.25rem", borderRadius: "0.75rem", fontSize: "1.2rem", outline: "none" }}
            />
            {error && <p style={{ color: "#ff5555", fontSize: "0.9rem" }}>{error}</p>}
            <button type="submit" disabled={!name.trim() || joining}
              style={{ background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "1rem", borderRadius: "0.75rem", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", opacity: !name.trim() || joining ? 0.4 : 1 }}>
              {joining ? "Joining…" : c.join.cta}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Album view
  return (
    <main style={{ minHeight: "100dvh", paddingBottom: "5rem" }}>
      {/* Header */}
      <div style={{ padding: "1.25rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
        <div>
          <h1 className="display" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{album?.name}</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
            {media.length} {media.length === 1 ? "photo" : "photos"} · {new Set(media.map(m => m.guest_id)).size} people
          </p>
        </div>
        <label style={{ background: "var(--accent)", color: "var(--accent-fg)", padding: "0.6rem 1rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}>
          {uploading ? c.upload.uploading(uploadProgress.done, uploadProgress.total) : c.upload.cta}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFiles(e.target.files)} disabled={uploading} />
        </label>
      </div>

      {uploading && (
        <div style={{ padding: "0.75rem 1rem", background: "var(--card)", borderBottom: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--muted)" }}>
          ⚠️ {c.upload.keepOpen}
        </div>
      )}

      {/* Filters + download */}
      <div style={{ padding: "0.75rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {(["all", "mine"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "0.4rem 0.9rem", borderRadius: "2rem", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", border: "none", background: filter === f ? "var(--accent)" : "var(--card)", color: filter === f ? "var(--accent-fg)" : "var(--muted)" }}>
            {f === "all" ? c.grid.filterAll : c.grid.filterMine}
          </button>
        ))}
        {media.some(m => m.guest_id !== guestId) && (
          <button onClick={downloadOthers}
            style={{ marginLeft: "auto", padding: "0.4rem 0.9rem", borderRadius: "2rem", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}>
            Save everyone's
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--muted)" }}>
          <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📸</p>
          <p>{c.grid.empty}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2px" }}>
          {filtered.map(item => (
            <div key={item.id} onClick={() => setLightbox(item)} style={{ aspectRatio: "1", overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--card)" }}>
              <img src={item.thumbUrl} alt={item.guests?.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {item.type === "video" && (
                <div style={{ position: "absolute", bottom: "0.4rem", right: "0.4rem", background: "rgba(0,0,0,0.6)", borderRadius: "0.25rem", padding: "0.15rem 0.35rem", fontSize: "0.7rem" }}>▶</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600 }}>
            {lightbox.type === "video"
              ? <video src={lightbox.url} controls autoPlay playsInline style={{ width: "100%", borderRadius: "0.5rem" }} />
              : <img src={lightbox.url} alt="" style={{ width: "100%", borderRadius: "0.5rem", maxHeight: "70vh", objectFit: "contain" }} />
            }
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", justifyContent: "center" }}>
              <button onClick={() => downloadSingle(lightbox)}
                style={{ padding: "0.6rem 1.25rem", borderRadius: "0.5rem", background: "var(--accent)", color: "var(--accent-fg)", border: "none", fontWeight: 700, cursor: "pointer" }}>
                Download
              </button>
              {lightbox.guest_id === guestId && (
                <button onClick={() => deleteMedia(lightbox.id)}
                  style={{ padding: "0.6rem 1.25rem", borderRadius: "0.5rem", background: "var(--card)", color: "#ff5555", border: "1px solid var(--border)", cursor: "pointer" }}>
                  Delete
                </button>
              )}
              {lightbox.guest_id !== guestId && (
                <button onClick={() => reportMedia(lightbox.id)}
                  style={{ padding: "0.6rem 1.25rem", borderRadius: "0.5rem", background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                  Report
                </button>
              )}
              <button onClick={() => setLightbox(null)}
                style={{ padding: "0.6rem 1.25rem", borderRadius: "0.5rem", background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
                Close
              </button>
            </div>
            <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              by {lightbox.guests?.name}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
