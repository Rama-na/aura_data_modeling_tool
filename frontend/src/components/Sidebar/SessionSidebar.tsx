import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Database } from 'lucide-react'
import { useSessionStore } from '../../store/sessionStore'
import { listSessions, createSession } from '../../api/sessions'

const STATUS_COLORS: Record<string, string> = {
  complete: '#10b981',
  refining: '#f59e0b',
  generating_notebooks: '#f59e0b',
  error: '#ef4444',
  uploading: '#94a3b8',
  parsing: '#3b82f6',
  checkpoint1_pending: '#3b82f6',
  checkpoint1_approved: '#3b82f6',
  schema_designing: '#f59e0b',
  checkpoint2_pending: '#f59e0b',
  checkpoint2_approved: '#f59e0b',
}

export default function SessionSidebar() {
  const navigate = useNavigate()
  const { sessions, setSessions, sidebarOpen, toggleSidebar, setCurrentSession } = useSessionStore()

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {})
  }, [sidebarOpen])

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 p-2 rounded-r-lg"
        style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
        title="My Sessions"
      >
        <Database size={16} />
      </button>
    )
  }

  const handleNewSession = async () => {
    const session = await createSession()
    setCurrentSession(session)
    setSessions([session, ...sessions])
    toggleSidebar()
    navigate(`/session/${session.session_id}/upload`)
  }

  const handleResumeSession = (sessionId: string) => {
    toggleSidebar()
    navigate(`/session/${sessionId}/refine`)
  }

  return (
    <aside
      className="w-72 shrink-0 flex flex-col border-r"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="font-semibold text-sm">My Sessions</span>
        <button onClick={toggleSidebar} style={{ color: 'var(--color-muted)' }}>
          <X size={16} />
        </button>
      </div>

      {/* New session */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={handleNewSession}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold text-black"
          style={{ background: 'var(--color-accent)' }}
        >
          <Plus size={14} /> New Analysis
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <div className="text-xs text-center py-6" style={{ color: 'var(--color-muted)' }}>No sessions yet</div>
        )}
        {sessions.map((s) => (
          <button
            key={s.session_id}
            onClick={() => handleResumeSession(s.session_id)}
            className="w-full text-left px-3 py-2.5 rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: 'var(--color-surface2)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate">{s.name}</span>
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }}
              />
            </div>
            <div className="text-xs flex gap-2" style={{ color: 'var(--color-muted)' }}>
              <span>{s.status.replace(/_/g, ' ')}</span>
              {s.table_count != null && s.table_count > 0 && <span>· {s.table_count} tables</span>}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}
