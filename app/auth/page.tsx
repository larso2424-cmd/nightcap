"use client";
import { useState } from "react";

export default function AuthPage() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError("");
    const res  = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setLoading(false); return; }
    setSent(true);
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "2rem 1.5rem 3rem" }}>
      <div>
        <span className="display" style={{ fontSize: "1rem", letterSpacing: "0.08em", color: "var(--muted)" }}>NightCap</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480, width: "100%", paddingTop: "3rem" }}>
        {sent ? (
          <>
            <h1 className="display" style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)", lineHeight: 1, marginBottom: "1rem" }}>Check your email</h1>
            <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>
              We sent a sign-in link to <strong style={{ color: "var(--fg)" }}>{email}</strong>.<br />
              Tap it to open your albums.
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "1.5rem" }}>
              No email? Check your spam folder, or{" "}
              <button onClick={() => { setSent(false); setLoading(false); }}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "inherit", padding: 0, textDecoration: "underline" }}>
                try again
              </button>.
            </p>
          </>
        ) : (
          <>
            <h1 className="display" style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)", lineHeight: 1, marginBottom: "0.5rem" }}>Sign in</h1>
            <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>We'll email you a link — no password needed.</p>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", padding: "1rem 1.25rem", borderRadius: "0.75rem", fontSize: "1.1rem", outline: "none" }}
              />
              {error && <p style={{ color: "#ff5555", fontSize: "0.9rem" }}>{error}</p>}
              <button type="submit" disabled={!email.trim() || loading}
                style={{ background: "var(--accent)", color: "var(--accent-fg)", border: "none", padding: "1rem", borderRadius: "0.75rem", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer", opacity: !email.trim() || loading ? 0.4 : 1 }}>
                {loading ? "Sending…" : "Send sign-in link"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
