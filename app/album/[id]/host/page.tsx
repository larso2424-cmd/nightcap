"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import copy from "@/lib/copy";

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
    });
  }, [params]);

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

  const [downloading, setDownloading] = useState(false);
  const guests = new Set(media.map(m => m.guest_id)).size;
  const uploaders = new Set(media.filter(m => m.thumbUrl).map(m => m.guest_id)).size;

  async function downloadAll() {
    if (!media.length) return;
    setDownloading(true);
    try {
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
          {media.length > 0 && (
            <div style={{ padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={downloadAll} disabled={downloading}
                style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent)", background: "transparent", border: "1px solid var(--accent)", borderRadius: "0.5rem", padding: "0.35rem 0.85rem", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.5 : 1 }}>
                {downloading ? "Downloading…" : `Download all (${media.length})`}
              </button>
            </div>
          )}
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
