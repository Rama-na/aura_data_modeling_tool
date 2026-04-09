import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SessionSidebar from './components/Sidebar/SessionSidebar'

// Lazy-load all pages — prevents one bad import from crashing the entire app
const HomePage = lazy(() => import('./pages/HomePage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))
const ContextPage = lazy(() => import('./pages/ContextPage'))
const PipelinePage = lazy(() => import('./pages/PipelinePage'))
const RefinementPage = lazy(() => import('./pages/RefinementPage'))
const SummaryPage = lazy(() => import('./pages/SummaryPage'))
const ExtractionScriptPage = lazy(() => import('./pages/ExtractionScriptPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--color-muted)' }}>
      <span className="text-sm animate-pulse">Loading…</span>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <SessionSidebar />
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/session/:sessionId/upload" element={<UploadPage />} />
                <Route path="/session/:sessionId/context" element={<ContextPage />} />
                <Route path="/session/:sessionId/pipeline" element={<PipelinePage />} />
                <Route path="/session/:sessionId/refine" element={<RefinementPage />} />
                <Route path="/session/:sessionId/summary" element={<SummaryPage />} />
                <Route path="/extraction-script" element={<ExtractionScriptPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
