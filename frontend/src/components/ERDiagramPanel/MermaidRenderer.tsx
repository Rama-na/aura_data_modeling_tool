import { useEffect, useRef, useState, useCallback } from 'react'
import mermaid from 'mermaid'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

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

const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

export default function MermaidRenderer({ source, loading = false, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.7)

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), [])
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), [])
  const zoomReset = useCallback(() => setZoom(0.7), [])

  useEffect(() => {
    if (!source || !ref.current) return
    setError(null)

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

  // Ctrl+scroll to zoom
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setZoom((z) => clampZoom(z - e.deltaY * 0.002))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  return (
    <div className="relative w-full h-full min-h-[400px] flex flex-col">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10"
          style={{ background: 'rgba(15,17,23,0.7)' }}>
          <div className="text-sm flex items-center gap-2" style={{ color: 'var(--color-accent)' }}>
            <span className="animate-pulse">●</span> Updating diagram…
          </div>
        </div>
      )}

      {/* Zoom controls */}
      {!error && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg px-1 py-0.5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <button onClick={zoomOut} className="p-1.5 rounded hover:opacity-80" title="Zoom out"
            style={{ color: 'var(--color-muted)' }}>
            <ZoomOut size={14} />
          </button>
          <span className="text-xs w-10 text-center select-none" style={{ color: 'var(--color-muted)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={zoomIn} className="p-1.5 rounded hover:opacity-80" title="Zoom in"
            style={{ color: 'var(--color-muted)' }}>
            <ZoomIn size={14} />
          </button>
          <div className="w-px h-4 mx-0.5" style={{ background: 'var(--color-border)' }} />
          <button onClick={zoomReset} className="p-1.5 rounded hover:opacity-80" title="Reset zoom"
            style={{ color: 'var(--color-muted)' }}>
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {error ? (
        <div className="p-4 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>{error}</div>
      ) : (
        <div ref={wrapperRef} className="flex-1 overflow-auto">
          <div
            ref={ref}
            className="mermaid-container"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              minWidth: 'fit-content',
            }}
          />
        </div>
      )}
    </div>
  )
}
