"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import copy from "@/lib/copy";

const c = copy.en;

export default function Home() {
  const router = useRouter();
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [userEmail, setUserEmail] = useState<string|null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(d => {
      if (d.user?.email) {
        setUserEmail(d.user.email);
      } else {
        router.replace("/auth");
      }
      setSessionChecked(true);
    });
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }

    // Store host token in localStorage so host can access their album
    try {
      localStorage.setItem(`host_token_${data.albumId}`, data.hostToken);
    } catch {}

    router.push(`/album/${data.albumId}/host`);
  }

  if (!sessionChecked) return null;

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem 3rem" }}>
      {/* Top nav */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="display" style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "var(--muted)" }}>NightCap</span>
        {userEmail ? (
          <a href="/dashboard" style={{ fontSize: "0.82rem", color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>My albums →</a>
        ) : (
          <a href="/auth" style={{ fontSize: "0.82rem", color: "var(--muted)", textDecoration: "none" }}>Sign in</a>
        )}
      </div>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <h1 className="display" style={{ fontSize: "clamp(2.8rem, 10vw, 5rem)", lineHeight: 1, marginBottom: "1rem", whiteSpace: "pre-line" }}>
          {c.landing.headline}
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: "2.5rem", fontSize: "1.05rem" }}>
          {c.landing.sub}
        </p>
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input
            type="text"
            placeholder={c.create.placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              padding: "1rem 1.25rem",
              borderRadius: "0.75rem",
              fontSize: "1.1rem",
              outline: "none",
              width: "100%",
            }}
          />
          {error && <p style={{ color: "#ff5555", fontSize: "0.9rem" }}>{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || loading}
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "none",
              padding: "1rem",
              borderRadius: "0.75rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              cursor: "pointer",
              opacity: !name.trim() || loading ? 0.4 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Creating…" : c.landing.cta}
          </button>
        </form>
      </div>
    </main>
  );
}
