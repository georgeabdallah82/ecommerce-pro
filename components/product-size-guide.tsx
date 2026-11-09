import { ChevronDown } from 'lucide-react'
import { parseSizeGuide } from '@/lib/size-guide'

// The size guide under the product description: a collapsed table the shopper opens when needed.
// Shows nothing when the owner has not written one (see lib/size-guide.ts for the format).
export default function ProductSizeGuide({ text, label }: { text: string | null | undefined; label: string }) {
  const guide = parseSizeGuide(text)
  if (!guide) return null
  const cell = { border: '1px solid var(--line, #e8e8e3)', padding: '8px 10px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const }
  return <details style={{ marginTop: 14 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{label}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
        <thead><tr>{guide.header.map((h, i) => <th key={i} style={{ ...cell, fontWeight: 800 }}>{h}</th>)}</tr></thead>
        <tbody>{guide.rows.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i} style={cell}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </details>
}
