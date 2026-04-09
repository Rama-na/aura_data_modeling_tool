import { create } from 'zustand'

export interface SessionMeta {
  session_id: string
  name: string
  status: string
  created_at: string
  updated_at: string
  last_iter_idx: number
  table_count?: number
  source_columns_file?: string
  source_fk_file?: string
}

interface SessionStore {
  currentSession: SessionMeta | null
  sessions: SessionMeta[]
  parsedSchema: unknown | null
  classificationResult: unknown | null
  approvedClassifications: unknown[] | null
  sidebarOpen: boolean

  setCurrentSession: (s: SessionMeta | null) => void
  setSessions: (sessions: SessionMeta[]) => void
  setParsedSchema: (s: unknown) => void
  setClassificationResult: (r: unknown) => void
  setApprovedClassifications: (c: unknown[]) => void
  toggleSidebar: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  currentSession: null,
  sessions: [],
  parsedSchema: null,
  classificationResult: null,
  approvedClassifications: null,
  sidebarOpen: false,

  setCurrentSession: (s) => set({ currentSession: s }),
  setSessions: (sessions) => set({ sessions }),
  setParsedSchema: (s) => set({ parsedSchema: s }),
  setClassificationResult: (r) => set({ classificationResult: r }),
  setApprovedClassifications: (c) => set({ approvedClassifications: c }),
  toggleSidebar: () => set((st) => ({ sidebarOpen: !st.sidebarOpen })),
}))
