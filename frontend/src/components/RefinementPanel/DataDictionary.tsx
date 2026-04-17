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
  dict: Record<string, unknown> | unknown[] | null
}

/** Normalize a single column entry — tolerates many field-name aliases. */
function normalizeColumn(c: RawEntry, fallbackName = ''): Column {
  return {
    name:
      c.name ??
      c.column_name ??
      c.field_name ??
      c.col_name ??
      c.attr_name ??
      c.field ??
      c.property_name ??
      fallbackName ??
      '',
    type: c.type ?? c.data_type ?? c.datatype ?? c.dtype ?? '',
    classification: c.classification ?? c.key_type ?? c.constraint ?? c.key ?? '',
    description: c.description ?? c.desc ?? c.comment ?? '',
  }
}

/** Columns may be a list OR a dict keyed by column name. */
function normalizeColumns(cols: unknown): Column[] {
  if (Array.isArray(cols)) {
    return cols
      .filter((c): c is RawEntry => typeof c === 'object' && c !== null)
      .map((c) => normalizeColumn(c))
  }
  if (cols && typeof cols === 'object') {
    const out: Column[] = []
    for (const [colName, body] of Object.entries(cols as RawEntry)) {
      if (body && typeof body === 'object') {
        out.push(normalizeColumn(body, colName))
      } else if (typeof body === 'string') {
        // {"sales_sk": "int"} shorthand
        out.push({ name: colName, type: body, classification: '', description: '' })
      }
    }
    return out
  }
  return []
}

/** Normalize a raw table entry from the LLM. */
function normalizeEntry(raw: RawEntry): { description: string; columns: Column[] } {
  const cols: unknown =
    raw.columns ??
    raw.column_definitions ??
    raw.fields ??
    raw.column_list ??
    raw.attributes ??
    []
  return {
    description: raw.description ?? raw.table_description ?? '',
    columns: normalizeColumns(cols),
  }
}

/**
 * Normalize the whole dictionary. Handles:
 *  - dict keyed by table name (normal case)
 *  - {"tables": {...}} or {"tables": [...]} wrapper
 *  - list of table objects: [{"table_name": "…", "columns": […]}, ...]
 */
function normalizeDict(
  raw: Record<string, unknown> | unknown[] | null,
): Record<string, { description: string; columns: Column[] }> {
  if (!raw) return {}

  // List shape
  if (Array.isArray(raw)) {
    const out: Record<string, { description: string; columns: Column[] }> = {}
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const entry = item as RawEntry
      const tableName = entry.table_name ?? entry.name ?? entry.table ?? ''
      if (!tableName) continue
      out[String(tableName)] = normalizeEntry(entry)
    }
    return out
  }

  // Unwrap single-key {"tables": ...} wrapper
  const keys = Object.keys(raw)
  if (keys.length === 1 && keys[0] === 'tables') {
    const inner = (raw as RawEntry).tables
    if (inner && (typeof inner === 'object' || Array.isArray(inner))) {
      return normalizeDict(inner)
    }
  }

  const out: Record<string, { description: string; columns: Column[] }> = {}
  for (const [tableName, entry] of Object.entries(raw)) {
    if (entry && typeof entry === 'object') {
      out[tableName] = normalizeEntry(entry as RawEntry)
    }
  }
  return out
}

export default function DataDictionary({ dict }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const normalized = normalizeDict(dict)
  const entries = Object.entries(normalized)

  if (entries.length === 0) return null

  return (
    <div className="space-y-1">
      {entries.map(([tableName, entry]) => (
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
      ))}

      <details className="mt-2 text-xs" style={{ color: 'var(--color-muted)' }} open={showRaw} onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer select-none">Raw JSON</summary>
        <pre className="mt-1 p-2 rounded overflow-auto max-h-64 mono text-[10px]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {JSON.stringify(dict, null, 2)}
        </pre>
      </details>
    </div>
  )
}
