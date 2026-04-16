import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, ChevronDown, ChevronRight, AlertCircle, Loader2, FileText, CheckCircle2 } from 'lucide-react'
import { useRefinementStore, IterationDetail, IterationStage } from '../store/refinementStore'
import MermaidRenderer from '../components/ERDiagramPanel/MermaidRenderer'
import VersionSwitcher from '../components/ERDiagramPanel/VersionSwitcher'
import DataDictionary from '../components/RefinementPanel/DataDictionary'
import RevisionHistory from '../components/RefinementPanel/RevisionHistory'
import DebugPanel from '../components/DebugPanel/DebugPanel'

const MAX_COMMENT = 500

/** Stage-aware progress shown while an iteration is running */
function AgentProgressPanel({ stage, startedAt }: { stage: IterationStage; startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const a4Done = stage === 'agent5_running' || stage === 'complete'
  const a4Running = stage === 'agent4_running' || stage === 'waiting'
  const a5Running = stage === 'agent5_running'

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
        Designing your star schema…
      </div>

      <div className="w-full max-w-xs space-y-3">
        {/* Agent 4 */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {a4Done ? (
            <CheckCircle2 size={16} style={{ color: 'var(--color-accent)' }} />
          ) : (
            <Loader2 size={16} className="animate-spin" style={{ color: a4Running ? 'var(--color-accent)' : 'var(--color-muted)' }} />
          )}
          <div>
            <div className="text-sm font-medium">Schema Designer</div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>Agent 4 — star schema plan</div>
          </div>
          {a4Done && <span className="ml-auto text-xs" style={{ color: 'var(--color-accent)' }}>done</span>}
        </div>

        {/* Agent 5 */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', opacity: a4Running ? 0.5 : 1 }}>
          {a5Running ? (
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--color-border)' }} />
          )}
          <div>
            <div className="text-sm font-medium">ER Generator</div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>Agent 5 — Mermaid diagram + data dictionary</div>
          </div>
        </div>
      </div>

      <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {elapsed < 60
          ? `${elapsed}s elapsed — typically 15–30 seconds`
          : `${elapsed}s elapsed — taking longer than usual, still running…`}
      </div>
    </div>
  )
}

export default function RefinementPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const store = useRefinementStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showRawMermaid, setShowRawMermaid] = useState(false)
  const [mermaidRenderError, setMermaidRenderError] = useState(false)

  const {
    iterations, currentIterIdx, latestIterIdx, viewingIterDetail,
    isPolling, isSubmitting, commentDraft, historyOpen, debugOpen,
    notebookJob, notebookPolling, error,
    init, submitComment, switchToIteration, generateNotebooks,
    setCommentDraft, toggleHistory, toggleDebug, clearError,
  } = store

  const isViewingLatest = currentIterIdx === latestIterIdx
  const latestDetail = viewingIterDetail as IterationDetail | null
  const latestIsComplete = iterations.find((i) => i.iter_idx === latestIterIdx)?.status === 'complete'
  const currentStage = iterations.find((i) => i.iter_idx === latestIterIdx)?.stage ?? 'waiting'

  const canRefine = commentDraft.trim().length > 0 && !isPolling && !isSubmitting && isViewingLatest
  const canGenerate = latestIsComplete && isViewingLatest && !notebookPolling

  // Init on mount
  useEffect(() => {
    if (sessionId) {
      init(sessionId)
    }
  }, [sessionId])

  // Focus textarea after iteration completes
  useEffect(() => {
    if (!isPolling && latestIsComplete && textareaRef.current && isViewingLatest) {
      textareaRef.current.focus()
    }
  }, [isPolling, latestIsComplete])

  // Reset render error when mermaid source changes
  useEffect(() => {
    setMermaidRenderError(false)
    setShowRawMermaid(false)
  }, [latestDetail?.agent5?.output_mermaid])

  const handleSubmit = async () => {
    if (!canRefine) return
    await submitComment(commentDraft)
  }

  const handleGenerate = async () => {
    if (!sessionId || !canGenerate) return
    await generateNotebooks()
  }

  const handleCopyMermaid = () => {
    const src = latestDetail?.agent5?.output_mermaid
    if (src) navigator.clipboard.writeText(src)
  }

  const stageLabel = () => {
    switch (currentStage) {
      case 'agent4_running': return 'Schema Designer (Agent 4) running…'
      case 'agent5_running': return 'ER Generator (Agent 5) running…'
      case 'complete': return null
      default: return 'Initialising…'
    }
  }

  const statusLine = () => {
    if (notebookPolling && notebookJob) {
      return `Notebooks generating — ${notebookJob.domains_completed} of ${notebookJob.domains_total} domains done`
    }
    if (notebookJob?.status === 'complete') return 'Notebooks ready — '
    if (isPolling) return stageLabel() ?? `Iteration ${latestIterIdx + 1} running…`
    if (iterations.length === 0) return 'Initialising…'
    if (!isViewingLatest) return `Viewing v${currentIterIdx + 1} (v${latestIterIdx + 1} is current — read only)`
    return `Iteration ${latestIterIdx + 1} of ${iterations.length} — reviewing`
  }

  const mermaidSource = latestDetail?.agent5?.output_mermaid || ''
  const dataDict = latestDetail?.agent5?.output_dict as Record<string, unknown> | null
  const runningIter = iterations.find((i) => i.iter_idx === latestIterIdx && i.status === 'running')

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="font-semibold">Review ER Diagram</h1>
          <div className="text-xs mt-0.5" style={{ color: isPolling ? 'var(--color-warning)' : notebookPolling ? 'var(--color-warning)' : 'var(--color-muted)' }}>
            {statusLine()}
            {notebookJob?.status === 'complete' && (
              <button
                onClick={() => navigate(`/session/${sessionId}/summary`)}
                className="ml-1 underline"
                style={{ color: 'var(--color-accent)' }}
              >
                View summary →
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {mermaidSource && (
            <button onClick={handleCopyMermaid} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}>
              <Copy size={12} /> Copy Mermaid
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 flex items-center gap-2 text-sm shrink-0" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={clearError} className="ml-auto">✕</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* ER Diagram Panel */}
        <div className="flex-[6] flex flex-col overflow-hidden border-r p-4 gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <VersionSwitcher
            iterations={iterations}
            currentIterIdx={currentIterIdx}
            latestIterIdx={latestIterIdx}
            onSwitch={switchToIteration}
          />
          <div className="flex-1 overflow-auto rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {isPolling ? (
              /* Show progress panel whenever polling — even before runningIter appears in store */
              <AgentProgressPanel
                stage={currentStage}
                startedAt={runningIter?.created_at ?? new Date().toISOString()}
              />
            ) : iterations.length === 0 ? (
              <div className="flex items-center justify-center h-full gap-2" style={{ color: 'var(--color-muted)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Waiting for first iteration…</span>
              </div>
            ) : mermaidSource && !showRawMermaid ? (
              <div className="p-4 h-full">
                <MermaidRenderer
                  source={mermaidSource}
                  loading={false}
                  onError={() => setMermaidRenderError(true)}
                />
                {mermaidRenderError && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Diagram failed to render.</span>
                    <button
                      onClick={() => setShowRawMermaid(true)}
                      className="text-xs underline"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      Show raw Mermaid source
                    </button>
                  </div>
                )}
              </div>
            ) : mermaidSource && showRawMermaid ? (
              <div className="p-4 h-full flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Raw Mermaid source</span>
                  <button onClick={() => setShowRawMermaid(false)} className="text-xs underline" style={{ color: 'var(--color-accent)' }}>
                    Try diagram again
                  </button>
                </div>
                <pre className="flex-1 overflow-auto text-xs rounded-lg p-3 font-mono" style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                  {mermaidSource}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-muted)' }}>
                <span className="text-sm">No diagram yet</span>
              </div>
            )}
          </div>
        </div>

        {/* Refinement Panel */}
        <div className="flex-[4] flex flex-col overflow-y-auto p-4 gap-4">
          {/* Read-only banner when viewing old iteration */}
          {!isViewingLatest && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>
              <AlertCircle size={14} />
              Viewing v{currentIterIdx + 1} — switch to latest to make changes
              <button onClick={() => switchToIteration(latestIterIdx)} className="ml-auto underline text-xs">
                Switch to v{latestIterIdx + 1}
              </button>
            </div>
          )}

          {/* Data Dictionary */}
          {dataDict && Object.keys(dataDict).length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Data Dictionary</div>
              <DataDictionary dict={dataDict as Record<string, { description: string; columns: { name: string; type: string; classification: string; description: string }[] }>} />
            </div>
          )}

          {/* Comment form */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {isViewingLatest ? 'Comment on this design:' : 'Viewing historical version (read only)'}
            </label>
            <textarea
              ref={textareaRef}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value.slice(0, MAX_COMMENT))}
              disabled={!isViewingLatest || isPolling || isSubmitting}
              placeholder="Describe what you'd like to change — e.g., 'Split customer_dim into customer and address tables'"
              className="w-full resize-none rounded-lg p-3 text-sm outline-none"
              rows={4}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontFamily: 'inherit',
                opacity: !isViewingLatest ? 0.5 : 1,
              }}
            />
            <div className="text-xs text-right mt-1" style={{ color: 'var(--color-muted)' }}>
              {commentDraft.length} / {MAX_COMMENT}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!canRefine}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
              style={{
                background: canRefine ? 'var(--color-surface2)' : 'var(--color-surface)',
                color: canRefine ? 'var(--color-text)' : 'var(--color-muted)',
                border: `1px solid var(--color-border)`,
              }}
            >
              {isSubmitting || isPolling ? <Loader2 size={14} className="animate-spin" /> : null}
              {isPolling ? 'Running…' : 'Refine Model'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              title={!isViewingLatest ? 'Switch to latest version first' : !latestIsComplete ? 'Wait for current iteration to complete' : ''}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-black"
              style={{
                background: canGenerate ? 'var(--color-accent)' : 'var(--color-surface2)',
                color: canGenerate ? '#000' : 'var(--color-muted)',
              }}
            >
              {notebookPolling ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {notebookPolling ? `Generating (${notebookJob?.domains_completed}/${notebookJob?.domains_total})` : 'Generate Notebooks →'}
            </button>
          </div>

          {/* Revision history */}
          <div>
            <button
              onClick={toggleHistory}
              className="flex items-center gap-1 text-xs mb-2"
              style={{ color: 'var(--color-muted)' }}
            >
              {historyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Revision history ({iterations.filter((i) => i.user_comment).length} changes)
            </button>
            {historyOpen && <RevisionHistory iterations={iterations} />}
          </div>
        </div>
      </div>

      {/* Debug panel */}
      <div className="shrink-0 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <button
          onClick={toggleDebug}
          className="w-full flex items-center gap-2 px-6 py-2 text-xs"
          style={{ color: 'var(--color-muted)', background: 'var(--color-bg)' }}
        >
          {debugOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Debug — agent reasoning & token usage
        </button>
        {debugOpen && latestDetail && (
          <div style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', maxHeight: '300px', overflowY: 'auto' }}>
            <DebugPanel iterations={[]} currentDetail={latestDetail} />
          </div>
        )}
      </div>
    </div>
  )
}
