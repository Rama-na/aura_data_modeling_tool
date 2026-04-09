import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { runClassification } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'

const MAX_CHARS = 1500

export default function ContextPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { parsedSchema, setClassificationResult } = useSessionStore()

  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedTable, setExpandedTable] = useState<string | null>(null)

  const schema = parsedSchema as { tables: unknown[]; table_count: number; relationship_count: number } | null
  const tables = (schema?.tables || []) as Array<{ schema_name: string; table_name: string; columns: unknown[]; row_count?: number; fk_count?: number }>

  const handleRunAnalysis = async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const result = await runClassification(sessionId, context, {})
      setClassificationResult(result)
      navigate(`/session/${sessionId}/pipeline`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="px-8 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Step 2 of 5</div>
          <h1 className="text-xl font-bold">Review parsed schema and add context</h1>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Schema Preview */}
        <div className="flex-[6] overflow-y-auto border-r p-6" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
            {schema?.table_count ?? 0} tables · {schema?.relationship_count ?? 0} relationships
          </div>

          {/* Search */}
          <div className="space-y-1">
            {tables.map((t) => {
              const key = `${t.schema_name}.${t.table_name}`
              const expanded = expandedTable === key
              const cols = (t.columns || []) as Array<{ name: string; data_type: string; nullable: boolean; is_pk: boolean }>
              return (
                <div key={key} className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedTable(expanded ? null : key)}
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="mono font-medium">{t.schema_name}.{t.table_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}>
                        {cols.length} cols
                      </span>
                      {t.fk_count === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
                          No FKs
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      {t.row_count != null ? t.row_count.toLocaleString() + ' rows' : ''}
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-4 pb-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr style={{ color: 'var(--color-muted)' }}>
                            <th className="text-left py-1 pr-4 font-medium">Column</th>
                            <th className="text-left py-1 pr-4 font-medium">Type</th>
                            <th className="text-left py-1 font-medium">Nullable</th>
                            <th className="text-left py-1 font-medium">PK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cols.map((col) => (
                            <tr key={col.name}>
                              <td className="py-0.5 pr-4 mono">{col.name}</td>
                              <td className="py-0.5 pr-4" style={{ color: 'var(--color-muted)' }}>{col.data_type}</td>
                              <td className="py-0.5" style={{ color: 'var(--color-muted)' }}>{col.nullable ? 'YES' : 'NO'}</td>
                              <td className="py-0.5">{col.is_pk ? '✓' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right — Context */}
        <div className="flex-[4] p-6 flex flex-col gap-4 overflow-y-auto">
          <div className="font-semibold">Tell the AI about your database</div>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value.slice(0, MAX_CHARS))}
            placeholder={`Examples:\n• "Our main transactional tables are OrderHeader and OrderLine"\n• "CustomerType and ProductCategory are lookup tables"\n• "Ignore any table starting with _Archive or _Log"\n• "The Date column in all tables is the business date"`}
            className="flex-1 resize-none rounded-lg p-3 text-sm outline-none min-h-[280px]"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontFamily: 'inherit' }}
          />
          <div className="text-xs text-right" style={{ color: 'var(--color-muted)' }}>{context.length} / {MAX_CHARS}</div>

          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
          )}

          <button
            onClick={handleRunAnalysis}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-black"
            style={{ background: 'var(--color-accent)' }}
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Running AI analysis...</> : 'Run AI Analysis →'}
          </button>
        </div>
      </div>
    </div>
  )
}
