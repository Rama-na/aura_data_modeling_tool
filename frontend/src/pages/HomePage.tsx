import { useNavigate } from 'react-router-dom'
import { ArrowRight, Upload, Cpu, FileCode } from 'lucide-react'
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
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="max-w-xl w-full space-y-8">

        {/* Hero */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            SQL Server → Star Schema
            <span style={{ color: 'var(--color-accent)' }}> in minutes</span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Upload your SQL Server schema files. An AI pipeline classifies your tables,
            designs a star schema, and generates ready-to-run Microsoft Fabric PySpark notebooks.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-black text-base"
          style={{ background: 'var(--color-accent)' }}
        >
          Get Started <ArrowRight size={18} />
        </button>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          {[
            { icon: Upload,   title: 'Upload SQL',      desc: 'Drop in your column metadata and FK relationship files from SSMS.' },
            { icon: Cpu,      title: 'AI Analyses',     desc: 'Six agents classify tables, design the star schema, and create an ER diagram.' },
            { icon: FileCode, title: 'Get Notebooks',   desc: 'Download PySpark notebooks ready to run in your Microsoft Fabric Lakehouse.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-4 rounded-xl text-left"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <Icon size={18} style={{ color: 'var(--color-accent)' }} className="mb-2" />
              <div className="font-semibold text-sm mb-1">{title}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Extraction script link */}
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Need the T-SQL extraction scripts?{' '}
          <button
            onClick={() => navigate('/extraction-script')}
            style={{ color: 'var(--color-accent)' }}
            className="underline"
          >
            Get them here
          </button>
        </p>

      </div>
    </div>
  )
}
