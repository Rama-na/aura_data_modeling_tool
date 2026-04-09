import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Column {
  name: string
  type: string
  classification: string
  description: string
}

interface TableEntry {
  description: string
  columns: Column[]
}

interface Props {
  dict: Record<string, TableEntry> | null
}

export default function DataDictionary({ dict }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!dict || Object.keys(dict).length === 0) return null

  return (
    <div className="space-y-1">
      {Object.entries(dict).map(([tableName, entry]) => (
        <div key={tableName} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left text-sm"
            style={{ background: 'var(--color-surface)' }}
            onClick={() => setExpanded(expanded === tableName ? null : tableName)}
          >
            <div className="flex items-center gap-2">
              {expanded === tableName ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="mono font-medium">{tableName}</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{entry.columns?.length ?? 0} cols</span>
          </button>
          {expanded === tableName && (
            <div className="px-3 pb-2 pt-1" style={{ background: 'var(--color-surface2)' }}>
              {entry.description && (
                <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>{entry.description}</p>
              )}
              <div className="space-y-0.5">
                {(entry.columns || []).map((col) => (
                  <div key={col.name} className="flex items-center gap-2 text-xs">
                    <span className="mono w-36 truncate">{col.name}</span>
                    <span style={{ color: 'var(--color-muted)' }} className="w-20 truncate">{col.type}</span>
                    {col.classification && (
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-surface)', color: 'var(--color-accent)' }}>
                        {col.classification}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
