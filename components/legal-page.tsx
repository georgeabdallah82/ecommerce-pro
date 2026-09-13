export function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="aliLegalPlaceholder">{children}</span>
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage">
        <h1>{title}</h1>
        <p className="aliLegalUpdated">Last updated: {updated}</p>
        {children}
      </div>
    </div>
  )
}
