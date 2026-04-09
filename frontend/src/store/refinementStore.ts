import { create } from 'zustand'
import { getIteration, listIterations, submitComment, generateNotebooks, getNotebookStatus } from '../api/iterations'

export interface IterationSummary {
  iter_idx: number
  trigger: 'initial' | 'user_comment'
  user_comment: string | null
  status: 'running' | 'complete' | 'error'
  created_at: string
}

export interface IterationDetail extends IterationSummary {
  error_msg?: string | null
  agent4: {
    input_snapshot: unknown
    output: unknown
    reasoning: string
    duration_ms: number
    token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
    required_retry: boolean
  } | null
  agent5: {
    input_snapshot: unknown
    output_mermaid: string
    output_dict: unknown
    reasoning: string
    duration_ms: number
    token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
    required_retry: boolean
  } | null
}

interface NotebookJob {
  status: 'running' | 'complete' | 'error'
  domains_total: number
  domains_completed: number
  current_domain: string
  manifest: unknown[]
  error_msg?: string | null
}

interface RefinementStore {
  sessionId: string | null
  iterations: IterationSummary[]
  currentIterIdx: number      // which version user is VIEWING
  latestIterIdx: number       // most recent iteration
  viewingIterDetail: IterationDetail | null
  isPolling: boolean
  isSubmitting: boolean
  commentDraft: string
  historyOpen: boolean
  debugOpen: boolean
  notebookJob: NotebookJob | null
  notebookPolling: boolean
  error: string | null

  // Actions
  init: (sessionId: string) => Promise<void>
  submitComment: (comment: string) => Promise<void>
  switchToIteration: (idx: number) => Promise<void>
  generateNotebooks: (fromIterIdx?: number) => Promise<void>
  setCommentDraft: (text: string) => void
  toggleHistory: () => void
  toggleDebug: () => void
  clearError: () => void
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let notebookPollTimer: ReturnType<typeof setInterval> | null = null

export const useRefinementStore = create<RefinementStore>((set, get) => ({
  sessionId: null,
  iterations: [],
  currentIterIdx: -1,
  latestIterIdx: -1,
  viewingIterDetail: null,
  isPolling: false,
  isSubmitting: false,
  commentDraft: '',
  historyOpen: false,
  debugOpen: false,
  notebookJob: null,
  notebookPolling: false,
  error: null,

  init: async (sessionId: string) => {
    set({ sessionId })
    const data = await listIterations(sessionId)
    const iters: IterationSummary[] = data.iterations || []
    const latestIdx = data.latest_iter_idx ?? -1
    set({ iterations: iters, latestIterIdx: latestIdx, currentIterIdx: latestIdx })

    // If latest is running (resumed session), start polling
    const latest = iters.find((i) => i.iter_idx === latestIdx)
    if (latest?.status === 'running') {
      get()._startPolling(latestIdx)
    } else if (latestIdx >= 0) {
      // Load detail for current
      await get().switchToIteration(latestIdx)
    }
  },

  submitComment: async (comment: string) => {
    const { sessionId } = get()
    if (!sessionId || !comment.trim()) return

    set({ isSubmitting: true, error: null })
    try {
      const data = await submitComment(sessionId, comment)
      const newIdx: number = data.iter_idx
      set((st) => ({
        isSubmitting: false,
        commentDraft: '',
        latestIterIdx: newIdx,
        iterations: [
          ...st.iterations,
          {
            iter_idx: newIdx,
            trigger: 'user_comment',
            user_comment: comment,
            status: 'running',
            created_at: new Date().toISOString(),
          },
        ],
      }))
      get()._startPolling(newIdx)
    } catch (e: unknown) {
      set({ isSubmitting: false, error: (e as Error).message })
    }
  },

  switchToIteration: async (idx: number) => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      const detail: IterationDetail = await getIteration(sessionId, idx)
      set({ currentIterIdx: idx, viewingIterDetail: detail })
    } catch (e: unknown) {
      set({ error: (e as Error).message })
    }
  },

  generateNotebooks: async (fromIterIdx?: number) => {
    const { sessionId, latestIterIdx } = get()
    if (!sessionId) return
    const idx = fromIterIdx ?? latestIterIdx

    set({ error: null })
    try {
      await generateNotebooks(sessionId, idx)
      set({ notebookPolling: true, notebookJob: { status: 'running', domains_total: 0, domains_completed: 0, current_domain: '', manifest: [] } })
      get()._startNotebookPolling()
    } catch (e: unknown) {
      set({ error: (e as Error).message })
    }
  },

  setCommentDraft: (text) => set({ commentDraft: text }),
  toggleHistory: () => set((st) => ({ historyOpen: !st.historyOpen })),
  toggleDebug: () => set((st) => ({ debugOpen: !st.debugOpen })),
  clearError: () => set({ error: null }),

  // Internal — not exposed on type but accessible via get()
  _startPolling: (idx: number) => {
    if (pollTimer) clearInterval(pollTimer)
    set({ isPolling: true })

    pollTimer = setInterval(async () => {
      const { sessionId } = get()
      if (!sessionId) return
      try {
        const detail: IterationDetail = await getIteration(sessionId, idx)
        if (detail.status === 'complete' || detail.status === 'error') {
          clearInterval(pollTimer!)
          pollTimer = null
          set((st) => ({
            isPolling: false,
            currentIterIdx: idx,
            viewingIterDetail: detail,
            iterations: st.iterations.map((it) =>
              it.iter_idx === idx ? { ...it, status: detail.status } : it
            ),
          }))
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1000)
  },

  _startNotebookPolling: () => {
    if (notebookPollTimer) clearInterval(notebookPollTimer)
    notebookPollTimer = setInterval(async () => {
      const { sessionId } = get()
      if (!sessionId) return
      try {
        const job: NotebookJob = await getNotebookStatus(sessionId)
        set({ notebookJob: job })
        if (job.status === 'complete' || job.status === 'error') {
          clearInterval(notebookPollTimer!)
          notebookPollTimer = null
          set({ notebookPolling: false })
        }
      } catch {
        // Ignore
      }
    }, 1500)
  },
} as RefinementStore & { _startPolling: (idx: number) => void; _startNotebookPolling: () => void }))
