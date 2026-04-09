import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Database, Home, Upload, Table2, BrainCircuit, GitBranch, BookOpen } from 'lucide-react'
import { listSessions } from '../../api/sessions'
import { useSessionStore } from '../../store/sessionStore'

const STEPS = [
  { key: 'home',     label: 'Home',           icon: Home,          path: (id: string) => '/' },
  { key: 'upload',   label: 'Upload Files',   icon: Upload,        path: (id: string) => `/session/${id}/upload` },
  { key: 'context',  label: 'Review Schema',  icon: Table2,        path: (id: string) => `/session/${id}/context` },
  { key: 'pipeline', label: 'AI Analysis',    icon: BrainCircuit,  path: (id: string) => `/session/${id}/pipeline` },
  { key: 'refine',   label: 'Refine Model',   icon: GitBranch,     path: (id: string) => `/session/${id}/refine` },
  { key: 'summary',  label: 'Notebooks',      icon: BookOpen,      path: (id: string) => `/session/${id}/summary` },
]

function getActiveStep(pathname: string): string {
  if (pathname.includes('/upload'))   return 'upload'
  if (pathname.includes('/context'))  return 'context'
  if (pathname.includes('/pipeline')) return 'pipeline'
  if (pathname.includes('/refine'))   return 'refine'
  if (pathname.includes('/summary'))  return 'summary'
  return 'home'
}

const STATUS_COLOR: Record<string, string> = {
  complete: '#10b981',
  refining: '#f59e0b',
  generating_notebooks: '#f59e0b',
  error: '#ef4444',
}

export default function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { sessionId } = useParams<{ sessionId?: string }>()
  const { sessions, setSessions, currentSession } = useSessionStore()

  const activeStep = getActiveStep(location.pathname)
  const activeSessionId = sessionId || currentSession?.session_id || ''

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {})
  }, [location.pathname])

  const handleStepClick = (step: typeof STEPS[0]) => {
    if (!activeSessionId && step.key !== 'home') return
    navigate(step.path(activeSessionId))
  }

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-screen"
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <Database size={18} style={{ color: 'var(--color-accent)' }} />
        <span className="font-semibold text-sm tracking-tight">Aura Data Modeler</span>
      </div>

      {/* Step navigation */}
      <nav className="p-3 space-y-0.5">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const isActive = activeStep === step.key
          const isDisabled = step.key !== 'home' && !activeSessionId

          return (
            <button
              key={step.key}
              onClick={() => handleStepClick(step)}
              disabled={isDisabled}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
              style={{
                background: isActive ? 'var(--color-surface2)' : 'transparent',
                color: isActive
                  ? 'var(--color-text)'
                  : isDisabled
                    ? 'var(--color-border)'
                    : 'var(--color-muted)',
                cursor: isDisabled ? 'default' : 'pointer',
              }}
            >
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: isActive ? 'var(--color-accent)' : 'var(--color-surface2)',
                  color: isActive ? '#000' : 'var(--color-muted)',
                }}
              >
                {i + 1}
              </span>
              <Icon size={14} className="shrink-0" />
              {step.label}
            </button>
          )
        })}
      </nav>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-1">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-border)' }}>
              Recent
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
            {sessions.slice(0, 8).map((s) => (
              <button
                key={s.session_id}
                onClick={() => navigate(`/session/${s.session_id}/refine`)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 hover:opacity-80"
                style={{ color: 'var(--color-muted)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: STATUS_COLOR[s.status] || 'var(--color-border)' }}
                />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
