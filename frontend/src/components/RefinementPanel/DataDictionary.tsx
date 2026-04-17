import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Column {
  name: string
  type: string
  classification: string
  description: string
}

// Loosely typed to tolerate varying LLM output shapes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawEntry = Record<string, any>

interface Props {
  dict: Record<string, unknown> | null
}

/** Normalize a raw entry from the LLM — handles column key aliases. */
function normalizeEntry(raw: RawEntry): { description: string; columns: Column[] } {
  const cols: unknown =
    raw.columns ?? raw.column_definitions ?? raw.fields ?? raw.column_list ?? []
  const columns: Column[] = Array.isArray(cols)
    ? cols
        .filter((c): c is RawEntry => typeof c === 'object' && c !== null)
        .map((c) => ({
          name: c.name ?? c.column_name ?? c.field_name ?? '',
          type: c.type ?? c.data_type ?? c.datatype ?? '',
          classification: c.classification ?? c.key_type ?? c.constraint ?? '',
          description: c.description ?? c.desc ?? '',
        }))
    : []
  return {
    description: raw.description ?? raw.table_description ?? '',
    columns,
  }
}

export default function DataDictionary({ dict }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!dict || Object.keys(dict).length === 0) return null

  return (
    <div className="space-y-1">
      {Object.entries(dict).map(([tableName, rawEntry]) => {
        const entry = normalizeEntry(typeof rawEntry === 'object' && rawEntry !== null ? rawEntry as RawEntry : {})
        return (
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
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{entry.columns.length} cols</span>
            </button>
            {expanded === tableName && (
              <div className="px-3 pb-2 pt-1" style={{ background: 'var(--color-surface2)' }}>
                {entry.description && (
                  <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>{entry.description}</p>
                )}
                <div className="space-y-0.5">
                  {entry.columns.map((col, i) => (
                    <div key={col.name || i} className="flex items-center gap-2 text-xs">
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
        )
      })}
    </div>
  )
}
