import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: 'dark' as const,
  themeVariables: {
    background: '#1a1d27',
    primaryColor: '#252837',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#2e3245',
    lineColor: '#f59e0b',
    secondaryColor: '#252837',
    tertiaryColor: '#1a1d27',
  },
}

interface Props {
  source: string
  loading?: boolean
  onError?: () => void
}

let diagCounter = 0
let mermaidInitialised = false

export default function MermaidRenderer({ source, loading = false, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!source || !ref.current) return
    setError(null)

    // Initialise once, lazily, inside the browser context
    if (!mermaidInitialised) {
      mermaid.initialize(MERMAID_CONFIG)
      mermaidInitialised = true
    }

    const id = `mermaid-${++diagCounter}`
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg
      })
      .catch((e) => {
        const msg = 'Diagram render error: ' + String(e).slice(0, 120)
        setError(msg)
        onError?.()
      })
  }, [source])


  return (
    <div className="relative w-full h-full min-h-[400px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10"
          style={{ background: 'rgba(15,17,23,0.7)' }}>
          <div className="text-sm flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
            <span className="animate-pulse">●</span> Updating diagram…
          </div>
        </div>
      )}
      {error ? (
        <div className="p-4 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
      ) : (
        <div ref={ref} className="mermaid-container overflow-auto" />
      )}
    </div>
  )
}
