"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AlbumRow = {
  id: string;
  name: string;
  created_at: string;
  expires_at: string;
  guests: { count: number }[];
  media:  { count: number }[];
};

function daysLeft(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [albums, setAlbums]   = useState<AlbumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState("");

  useEffect(() => {
    (async () => {
      const sd = await fetch("/api/auth/session").then(r => r.json());
      if (!sd.user) { router.replace("/auth"); return; }
      setEmail(sd.user.email ?? "");
      const d = await fetch("/api/albums/mine").then(r => r.json());
      if (Array.isArray(d)) setAlbums(d);
      setLoading(false);
    })();
  }, [router]);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/auth");
  }

  return (
    <main style={{ minHeight: "100dvh", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ padding: "1rem 1rem 0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
        <span className="display" style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "var(--muted)" }}>NightCap</span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
          <button onClick={signOut}
            style={{ fontSize: "0.78rem", color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", borderRadius: "2rem", padding: "0.3rem 0.7rem", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: "1.5rem 1rem 1rem" }}>
        <h1 className="display" style={{ fontSize: "clamp(1.8rem, 6vw, 2.5rem)", lineHeight: 1, marginBottom: "0.25rem" }}>Your albums</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>{albums.length} album{albums.length !== 1 ? "s" : ""}</p>

        <a href="/" style={{ display: "inline-block", background: "var(--accent)", color: "var(--accent-fg)", padding: "0.75rem 1.25rem", borderRadius: "0.6rem", fontWeight: 700, fontSize: "0.95rem", textDecoration: "none", marginBottom: "1.5rem" }}>
          + New album
        </a>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : albums.length === 0 ? (
          <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--muted)" }}>
            <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📸</p>
            <p>No albums yet. Create your first one above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {albums.map(album => {
              const days      = daysLeft(album.expires_at);
              const guests    = album.guests?.[0]?.count ?? 0;
              const photoCount= album.media?.[0]?.count  ?? 0;
              const expired   = days <= 0;
              return (
                <div key={album.id}
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>{album.name}</h2>
                      <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>Created {fmt(album.created_at)}</p>
                    </div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "2rem", background: expired ? "rgba(255,85,85,0.15)" : days <= 3 ? "rgba(255,170,0,0.15)" : "rgba(100,200,100,0.1)", color: expired ? "#ff5555" : days <= 3 ? "#ffaa00" : "#77cc77", flexShrink: 0, marginLeft: "0.5rem" }}>
                      {expired ? "Expired" : `${days}d left`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    {[["👥", guests, "guests"], ["📸", photoCount, "photos"]].map(([icon, val, label]) => (
                      <div key={label as string} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.85rem" }}>{icon}</span>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{val}</span>
                        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <a href={`/album/${album.id}/host`}
                      style={{ flex: 1, background: "var(--accent)", color: "var(--accent-fg)", padding: "0.6rem", borderRadius: "0.5rem", fontWeight: 700, fontSize: "0.88rem", textDecoration: "none", textAlign: "center" }}>
                      Manage
                    </a>
                    <a href={`/album/${album.id}`}
                      style={{ flex: 1, background: "transparent", color: "var(--fg)", padding: "0.6rem", borderRadius: "0.5rem", fontWeight: 600, fontSize: "0.88rem", textDecoration: "none", textAlign: "center", border: "1px solid var(--border)" }}>
                      View as guest
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
