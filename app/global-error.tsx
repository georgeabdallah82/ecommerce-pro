'use client'

// Only triggers if the root layout itself throws after render has started
// (data fetches there are now caught with fallbacks -- see app/layout.tsx).
// This replaces the entire page including <html>/<body>, so it can't rely
// on the app's normal stylesheets loading; everything here is inlined.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fffaf6', color: '#191512', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong.</h1>
          <p style={{ color: '#746b64', marginBottom: 24, lineHeight: 1.6 }}>We couldn't load this page. Please try again in a moment.</p>
          <button
            onClick={() => reset()}
            style={{ background: '#ff5a1f', color: '#fff', border: 0, borderRadius: 10, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
