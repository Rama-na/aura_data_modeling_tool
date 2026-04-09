import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppSidebar from './components/Sidebar/AppSidebar'

const HomePage            = lazy(() => import('./pages/HomePage'))
const UploadPage          = lazy(() => import('./pages/UploadPage'))
const ContextPage         = lazy(() => import('./pages/ContextPage'))
const PipelinePage        = lazy(() => import('./pages/PipelinePage'))
const RefinementPage      = lazy(() => import('./pages/RefinementPage'))
const SummaryPage         = lazy(() => import('./pages/SummaryPage'))
const ExtractionScriptPage = lazy(() => import('./pages/ExtractionScriptPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <AppSidebar />
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--color-muted)' }}>
                Loading…
              </div>
            }>
              <Routes>
                <Route path="/"                              element={<HomePage />} />
                <Route path="/session/:sessionId/upload"     element={<UploadPage />} />
                <Route path="/session/:sessionId/context"    element={<ContextPage />} />
                <Route path="/session/:sessionId/pipeline"   element={<PipelinePage />} />
                <Route path="/session/:sessionId/refine"     element={<RefinementPage />} />
                <Route path="/session/:sessionId/summary"    element={<SummaryPage />} />
                <Route path="/extraction-script"             element={<ExtractionScriptPage />} />
                <Route path="*"                              element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
