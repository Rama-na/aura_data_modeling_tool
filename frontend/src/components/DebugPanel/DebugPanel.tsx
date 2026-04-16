import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { IterationDetail } from '../../store/refinementStore'

interface Props {
  iterations: IterationDetail[]
  currentDetail: IterationDetail | null
}

function JsonModal({ data, onClose }: { data: unknown; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-3/4 max-h-[80vh] rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <div className="flex justify-between items-center px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="text-sm font-medium">JSON Snapshot</span>
          <button onClick={onClose} style={{ color: 'var(--color-muted)' }}>✕</button>
        </div>
        <pre className="overflow-auto p-4 text-xs mono flex-1" style={{ color: 'var(--color-text)' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function AgentTrace({ label, duration_ms, token_usage, reasoning, required_retry, input_snapshot, output }: {
  label: string; duration_ms: number; token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
  reasoning: string; required_retry: boolean; input_snapshot: unknown; output: unknown
}) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'input' | 'output' | null>(null)

  return (
    <div className="rounded-lg overflow-hidden mb-2" style={{ border: '1px solid var(--color-border)' }}>
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs"
        style={{ background: 'var(--color-surface2)' }}
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 font-medium">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
          {required_retry && <span className="px-1.5 py-0.5 rounded" style={{ background: '#78350f', color: '#fbbf24' }}>retried</span>}
        </div>
        <div className="flex gap-3" style={{ color: 'var(--color-muted)' }}>
          {duration_ms > 0 && <span>{(duration_ms / 1000).toFixed(1)}s</span>}
          {token_usage && <span>{token_usage.total_tokens.toLocaleString()} tokens</span>}
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-2" style={{ background: 'var(--color-bg)' }}>
          {reasoning && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-muted)' }}>Reasoning</div>
              <div className="text-xs p-2 rounded" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>
                {reasoning}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {input_snapshot && (
              <button onClick={() => setModal('input')} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-surface2)', color: 'var(--color-accent)' }}>
                View input snapshot ↗
              </button>
            )}
            {output && (
              <button onClick={() => setModal('output')} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--color-surface2)', color: 'var(--color-accent)' }}>
                View output JSON ↗
              </button>
            )}
          </div>
        </div>
      )}
      {modal === 'input' && <JsonModal data={input_snapshot} onClose={() => setModal(null)} />}
      {modal === 'output' && <JsonModal data={output} onClose={() => setModal(null)} />}
    </div>
  )
}

export default function DebugPanel({ currentDetail }: Props) {
  if (!currentDetail) return null

  const a4 = currentDetail.agent4
  const a5 = currentDetail.agent5
  const totalTokens = (a4?.token_usage?.total_tokens ?? 0) + (a5?.token_usage?.total_tokens ?? 0)

  return (
    <div className="p-4 text-xs">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">Iteration {currentDetail.iter_idx + 1} — Debug</span>
        {totalTokens > 0 && (
          <span style={{ color: 'var(--color-muted)' }}>{totalTokens.toLocaleString()} total tokens this iteration</span>
        )}
      </div>

      {a4 && (
        <AgentTrace
          label="Agent 4 — Schema Designer"
          duration_ms={a4.duration_ms}
          token_usage={a4.token_usage}
          reasoning={a4.reasoning}
          required_retry={a4.required_retry}
          input_snapshot={a4.input_snapshot}
          output={a4.output}
        />
      )}
      {a5 && (
        <AgentTrace
          label="Agent 5 — ER Generator"
          duration_ms={a5.duration_ms}
          token_usage={a5.token_usage}
          reasoning={a5.reasoning}
          required_retry={a5.required_retry}
          input_snapshot={a5.input_snapshot}
          output={a5.output_mermaid}
        />
      )}
      {currentDetail.error_msg && (
        <div className="mt-2 p-2 rounded text-xs" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
          Error: {currentDetail.error_msg}
        </div>
      )}
    </div>
  )
}
