export function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="aliLegalPlaceholder">{children}</span>
}

// Renders the merchant's real value once configured (env var), falling back
// to the flagged placeholder so an unset field stays visibly obvious instead
// of silently going blank.
export function ConfiguredField({ value, placeholder }: { value: string; placeholder: React.ReactNode }) {
  return value ? <>{value}</> : <Placeholder>{placeholder}</Placeholder>
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
