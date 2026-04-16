import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { approveCheckpoint1, approveCheckpoint2 } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'
import { useRefinementStore } from '../store/refinementStore'

type Classification = 'fact' | 'dimension' | 'ignore'

interface ClassificationRow {
  schema_name: string
  table_name: string
  classification: Classification
  reasoning: string
  user_override?: boolean
}

interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  is_pk: boolean
}

interface TableInfo {
  schema_name: string
  table_name: string
  columns: ColumnInfo[]
}

function ClassificationBadge({ cls }: { cls: Classification }) {
  const colors: Record<Classification, { bg: string; text: string }> = {
    fact: { bg: '#064e3b', text: '#6ee7b7' },
    dimension: { bg: '#1e3a5f', text: '#93c5fd' },
    ignore: { bg: '#374151', text: '#9ca3af' },
  }
  const { bg, text } = colors[cls]
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: bg, color: text }}>
      {cls}
    </span>
  )
}

export default function PipelinePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { classificationResult, setApprovedClassifications, parsedSchema } = useSessionStore()

  const raw = classificationResult as {
    classifications: ClassificationRow[]
    fact_count: number
    dimension_count: number
    ignore_count: number
    summary?: string
  } | null

  const schemaTables = ((parsedSchema as { tables?: TableInfo[] } | null)?.tables || [])

  const [rows, setRows] = useState<ClassificationRow[]>(raw?.classifications || [])
  const [comment, setComment] = useState('')
  const [expandedTable, setExpandedTable] = useState<string | null>(null)
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const factCount = rows.filter((r) => r.classification === 'fact').length
  const dimCount = rows.filter((r) => r.classification === 'dimension').length
  const ignoreCount = rows.filter((r) => r.classification === 'ignore').length

  const handleOverride = (idx: number, cls: Classification) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, classification: cls, user_override: true } : r))
  }

  const getColumns = (schema_name: string, table_name: string): ColumnInfo[] => {
    const t = schemaTables.find(
      (t) => t.schema_name === schema_name && t.table_name === table_name
    )
    return t?.columns || []
  }

  const handleApprove = async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      await approveCheckpoint1(sessionId, rows)
      setApprovedClassifications(rows)
      await approveCheckpoint2(sessionId, comment)
      useRefinementStore.getState().sessionId === null &&
        (useRefinementStore.setState({ sessionId }))
      navigate(`/session/${sessionId}/refine`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <div className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>Step 3 of 5 — Review classification</div>
      <h1 className="text-2xl font-bold mb-2">Domain Classification</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>
        The AI has classified each table. Override any that are incorrect before proceeding.
        Click a table name to see its columns.
      </p>

      {/* Summary badges */}
      <div className="flex gap-3 mb-6">
        <span className="px-3 py-1 rounded-full text-sm" style={{ background: '#064e3b', color: '#6ee7b7' }}>{factCount} fact</span>
        <span className="px-3 py-1 rounded-full text-sm" style={{ background: '#1e3a5f', color: '#93c5fd' }}>{dimCount} dimension</span>
        <span className="px-3 py-1 rounded-full text-sm" style={{ background: '#374151', color: '#9ca3af' }}>{ignoreCount} ignore</span>
      </div>

      {raw?.summary && (
        <div className="p-4 rounded-lg mb-6 text-sm" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
          {raw.summary}
        </div>
      )}

      {/* Classification table */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}>
              <th className="text-left px-4 py-2 font-medium">Table</th>
              <th className="text-left px-4 py-2 font-medium">Classification</th>
              <th className="text-left px-4 py-2 font-medium">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = `${row.schema_name}.${row.table_name}`
              const dimmed = row.classification === 'ignore'
              const colsExpanded = expandedTable === key
              const cols = getColumns(row.schema_name, row.table_name)
              return (
                <>
                  <tr
                    key={key}
                    style={{
                      background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)',
                      opacity: dimmed ? 0.5 : 1,
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        className="flex items-center gap-1.5 mono font-medium text-left hover:opacity-80"
                        onClick={() => setExpandedTable(colsExpanded ? null : key)}
                        title={cols.length > 0 ? `${cols.length} columns` : 'No column data'}
                      >
                        {colsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {key}
                        {cols.length > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded ml-1" style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}>
                            {cols.length}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={row.classification}
                        onChange={(e) => handleOverride(i, e.target.value as Classification)}
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: 'var(--color-surface2)', color: 'var(--color-text)', border: row.user_override ? '1px solid var(--color-accent)' : 'none' }}
                      >
                        <option value="fact">fact</option>
                        <option value="dimension">dimension</option>
                        <option value="ignore">ignore</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setExpandedReasoning(expandedReasoning === key ? null : key)}
                        className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {expandedReasoning === key ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {expandedReasoning === key ? row.reasoning : row.reasoning.slice(0, 60) + '…'}
                      </button>
                    </td>
                  </tr>
                  {colsExpanded && cols.length > 0 && (
                    <tr
                      key={`${key}-cols`}
                      style={{ background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg)' }}
                    >
                      <td colSpan={3} className="px-8 pb-3 pt-0">
                        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}>
                                <th className="text-left px-3 py-1.5 font-medium">Column</th>
                                <th className="text-left px-3 py-1.5 font-medium">Type</th>
                                <th className="text-left px-3 py-1.5 font-medium">Nullable</th>
                                <th className="text-left px-3 py-1.5 font-medium">PK</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cols.map((col) => (
                                <tr key={col.name} style={{ borderTop: '1px solid var(--color-border)' }}>
                                  <td className="px-3 py-1.5 mono">{col.name}</td>
                                  <td className="px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>{col.data_type}</td>
                                  <td className="px-3 py-1.5" style={{ color: 'var(--color-muted)' }}>{col.nullable ? 'YES' : 'NO'}</td>
                                  <td className="px-3 py-1.5" style={{ color: col.is_pk ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                                    {col.is_pk ? '✓' : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pre-design comment */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Anything to correct before we design the schema? (optional)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g. 'Treat CustomerLookup as a dimension, not fact'"
          className="w-full resize-none rounded-lg p-3 text-sm outline-none"
          rows={3}
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: 'inherit' }}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
      )}

      <button
        onClick={handleApprove}
        disabled={loading || rows.length === 0}
        className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black"
        style={{ background: 'var(--color-accent)' }}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Designing schema...</>
          : <><CheckCircle size={16} /> Looks correct — design the schema</>
        }
      </button>
    </div>
  )
}
