import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Download, ChevronDown, ChevronRight, AlertCircle, Loader2, FileText } from 'lucide-react'
import { useRefinementStore, IterationDetail } from '../store/refinementStore'
import MermaidRenderer from '../components/ERDiagramPanel/MermaidRenderer'
import VersionSwitcher from '../components/ERDiagramPanel/VersionSwitcher'
import DataDictionary from '../components/RefinementPanel/DataDictionary'
import RevisionHistory from '../components/RefinementPanel/RevisionHistory'
import DebugPanel from '../components/DebugPanel/DebugPanel'

const MAX_COMMENT = 500

export default function RefinementPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const store = useRefinementStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const statusLine = () => {
    if (notebookPolling && notebookJob) {
      return `Notebooks generating — ${notebookJob.domains_completed} of ${notebookJob.domains_total} domains done`
    }
    if (notebookJob?.status === 'complete') return 'Notebooks ready — '
    if (isPolling) return `Iteration ${latestIterIdx + 1} running…`
    if (iterations.length === 0) return 'Initialising…'
    if (!isViewingLatest) return `Viewing v${currentIterIdx + 1} (v${latestIterIdx + 1} is current — read only)`
    return `Iteration ${latestIterIdx + 1} of ${iterations.length} — reviewing`
  }

  const mermaidSource = latestDetail?.agent5?.output_mermaid || ''
  const dataDict = latestDetail?.agent5?.output_dict as Record<string, unknown> | null

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h1 className="font-semibold">Review ER Diagram</h1>
          <div className="text-xs mt-0.5" style={{ color: notebookPolling ? 'var(--color-warning)' : 'var(--color-muted)' }}>
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
          <div className="flex-1 overflow-auto rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            {iterations.length === 0 ? (
              <div className="flex items-center justify-center h-full gap-2" style={{ color: 'var(--color-muted)' }}>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Designing initial schema…</span>
              </div>
            ) : mermaidSource ? (
              <MermaidRenderer source={mermaidSource} loading={isPolling} />
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
                border: `1px solid ${canRefine ? 'var(--color-border)' : 'var(--color-border)'}`,
                color: 'var(--color-text)',
                fontFamily: 'inherit',
                opacity: !isViewingLatest ? 0.5 : 1,
              }}
            />
            <div className="text-xs text-right mt-1" style={{ color: 'var(--color-muted)' }}>
              {commentDraft.length} / {MAX_COMMENT}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
              {error}
              <button onClick={clearError} className="ml-auto">✕</button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!canRefine}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
              style={{
                background: canRefine ? 'var(--color-surface2)' : 'var(--color-surface)',
                color: canRefine ? 'var(--color-text)' : 'var(--color-muted)',
                border: `1px solid ${canRefine ? 'var(--color-border)' : 'var(--color-border)'}`,
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
