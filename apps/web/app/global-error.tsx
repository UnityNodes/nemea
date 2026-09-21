"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f2f1ea", color: "#22261f" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 44, lineHeight: 1.05, margin: 0 }}>Nemea could not start</h1>
          <p role="alert" style={{ marginTop: 16, fontSize: 18, lineHeight: 1.55, color: "#555a4d" }}>
            Something went wrong while loading the app. Your holdings and your funds are not affected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 28, minHeight: 48, padding: "0 24px", borderRadius: 12, border: 0, background: "#3b5837", color: "#f7f6ef", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
