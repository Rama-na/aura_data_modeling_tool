import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, Copy, FileCode, Database, BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { getNotebookManifest } from '../api/iterations'
import { getSession, renameSession } from '../api/sessions'
import { useRefinementStore } from '../store/refinementStore'

export default function SummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { viewingIterDetail, iterations } = useRefinementStore()

  const [sessionName, setSessionName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [manifest, setManifest] = useState<unknown[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    getSession(sessionId).then((s) => setSessionName(s.name)).catch(() => {})
    getNotebookManifest(sessionId).then(setManifest).catch(() => {})
  }, [sessionId])

  const mermaidSource = viewingIterDetail?.agent5?.output_mermaid || ''

  const handleCopyMermaid = () => {
    if (mermaidSource) {
      navigator.clipboard.writeText(mermaidSource)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRename = async () => {
    if (!sessionId) return
    await renameSession(sessionId, sessionName)
    setEditingName(false)
  }

  const nbCount = (manifest as Array<{ filename: string }>).length

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      {/* Session name */}
      <div className="flex items-center gap-3 mb-8">
        {editingName ? (
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="text-2xl font-bold bg-transparent border-b outline-none"
            style={{ borderColor: 'var(--color-accent)', color: 'var(--color-text)' }}
            autoFocus
          />
        ) : (
          <h1
            className="text-2xl font-bold cursor-pointer hover:underline"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {sessionName || 'Untitled Session'}
          </h1>
        )}
        <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-surface2)', color: 'var(--color-success)' }}>Complete</span>
      </div>

      {/* Output cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {/* ER Diagram */}
        <div className="p-5 rounded-xl flex flex-col gap-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <Database size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="font-semibold text-sm">ER Diagram</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {viewingIterDetail?.agent5?.output_mermaid ? 'Mermaid erDiagram generated' : 'Not yet generated'}
          </div>
          <div className="flex gap-2 mt-auto">
            <button
              onClick={handleCopyMermaid}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
            >
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy source'}
            </button>
            <button
              onClick={() => navigate(`/session/${sessionId}/refine`)}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
            >
              View ER
            </button>
          </div>
        </div>

        {/* Notebooks */}
        <div className="p-5 rounded-xl flex flex-col gap-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <FileCode size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="font-semibold text-sm">PySpark Notebooks</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {nbCount > 0 ? `${nbCount} notebook${nbCount !== 1 ? 's' : ''} generated` : 'Not yet generated'}
          </div>
          <div className="flex gap-2 mt-auto">
            {nbCount > 0 && (
              <a
                href={`/api/v1/sessions/${sessionId}/notebooks/download`}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
                style={{ background: 'var(--color-accent)', color: '#000' }}
              >
                <Download size={12} /> Download .zip
              </a>
            )}
          </div>
        </div>

        {/* Data Dictionary */}
        <div className="p-5 rounded-xl flex flex-col gap-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="font-semibold text-sm">Data Dictionary</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {viewingIterDetail?.agent5?.output_dict ? 'Available inline' : 'Not yet generated'}
          </div>
          <div className="flex gap-2 mt-auto">
            <button
              onClick={() => navigate(`/session/${sessionId}/refine`)}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
            >
              View inline
            </button>
          </div>
        </div>
      </div>

      {/* Notebook manifest */}
      {nbCount > 0 && (
        <div className="mb-8 rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          <div className="px-4 py-3 text-sm font-medium" style={{ background: 'var(--color-surface2)' }}>Notebook manifest</div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--color-surface)', color: 'var(--color-muted)' }}>
                <th className="text-left px-4 py-2 text-xs font-medium">File</th>
                <th className="text-left px-4 py-2 text-xs font-medium">Domain</th>
                <th className="text-left px-4 py-2 text-xs font-medium">Tables</th>
                <th className="text-left px-4 py-2 text-xs font-medium">Cells</th>
              </tr>
            </thead>
            <tbody>
              {(manifest as Array<{ filename: string; domain: string; tables: string[]; cell_count: number }>).map((nb, i) => (
                <tr key={nb.filename} style={{ background: i % 2 === 0 ? 'var(--color-bg)' : 'var(--color-surface)' }}>
                  <td className="px-4 py-2 mono text-xs">{nb.filename}</td>
                  <td className="px-4 py-2 text-xs">{nb.domain}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--color-muted)' }}>{(nb.tables || []).join(', ')}</td>
                  <td className="px-4 py-2 text-xs">{nb.cell_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent reasoning log */}
      <div className="rounded-xl overflow-hidden mb-8" style={{ border: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setLogOpen(!logOpen)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-left"
          style={{ background: 'var(--color-surface2)' }}
        >
          {logOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Agent reasoning log ({iterations.length} iterations)
        </button>
        {logOpen && (
          <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
            {iterations.map((it) => (
              <div key={it.iter_idx} className="text-xs">
                <div className="font-medium mb-1">
                  v{it.iter_idx + 1}
                  {it.user_comment && <span style={{ color: 'var(--color-muted)' }}> — "{it.user_comment}"</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--color-accent)', color: '#000' }}
        >
          Start new analysis
        </button>
        <button
          onClick={() => useRefinementStore.getState().toggleHistory()}
          className="px-5 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
        >
          Back to sessions
        </button>
      </div>
    </div>
  )
}
