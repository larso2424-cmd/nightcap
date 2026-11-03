export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.5rem", marginBottom: "2rem" }}>Privacy</h1>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>What we store</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          We store the album name, your first name, and the photos and videos you upload. We do not store your email address, phone number, or any other personal data.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Where</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          All data is stored in the EU (Supabase EU region, Cloudflare Western Europe). We do not transfer data outside the EU.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>How long</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Albums and all associated files are automatically deleted 30 days after creation.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Removing content</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          You can delete your own uploads at any time from the album. To request removal of any other content, email us at{" "}
          <a href="mailto:privacy@nightcap.app" style={{ color: "var(--accent)" }}>privacy@nightcap.app</a>.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Reporting</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Every photo has a Report button. Reported content is reviewed and removed if it violates our terms. This is required under the EU Digital Services Act.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Contact</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Questions? <a href="mailto:privacy@nightcap.app" style={{ color: "var(--accent)" }}>privacy@nightcap.app</a>
        </p>
      </section>
    </main>
  );
}
