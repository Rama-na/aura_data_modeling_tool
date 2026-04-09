import { useNavigate } from 'react-router-dom'
import { Database, ArrowRight, Upload, Cpu, FileCode } from 'lucide-react'
import { createSession } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'

export default function HomePage() {
  const navigate = useNavigate()
  const { setCurrentSession } = useSessionStore()

  const handleStart = async () => {
    const session = await createSession()
    setCurrentSession(session)
    navigate(`/session/${session.session_id}/upload`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <Database size={20} style={{ color: 'var(--color-accent)' }} />
          <span className="font-semibold text-lg tracking-tight">Schema Transformer</span>
        </div>
        <button
          onClick={() => useSessionStore.getState().toggleSidebar()}
          className="text-sm px-3 py-1.5 rounded"
          style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
        >
          My Sessions
        </button>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">
            SQL Server → Star Schema
            <span style={{ color: 'var(--color-accent)' }}> in minutes</span>
          </h1>
          <p style={{ color: 'var(--color-muted)' }} className="text-lg mb-8">
            Upload your SQL Server schema files. An AI pipeline classifies your tables,
            designs a star schema, and generates ready-to-run Microsoft Fabric PySpark notebooks.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black"
              style={{ background: 'var(--color-accent)' }}
            >
              Start New Analysis <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/extraction-script')}
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-text)' }}
            >
              Get Extraction Script
            </button>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-6 max-w-3xl w-full mt-4">
          {[
            { icon: Upload, title: 'Upload SQL', desc: 'Drop in your column metadata and FK relationship files exported from SSMS.' },
            { icon: Cpu, title: 'AI Analyses', desc: 'Six agents classify tables, design the star schema, and generate an ER diagram.' },
            { icon: FileCode, title: 'Get Notebooks', desc: 'Download PySpark notebooks ready to run in your Microsoft Fabric Lakehouse.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-5 rounded-xl text-left"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <Icon size={20} style={{ color: 'var(--color-accent)' }} className="mb-3" />
              <div className="font-semibold mb-1">{title}</div>
              <div className="text-sm" style={{ color: 'var(--color-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
