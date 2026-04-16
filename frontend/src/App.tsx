import { lazy, Suspense, Component, ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppSidebar from './components/Sidebar/AppSidebar'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{ padding: '2rem', color: '#fca5a5', fontFamily: 'monospace' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Something went wrong
          </h2>
          <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#1a1d27', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #7f1d1d' }}>
            {err.message}
            {'\n\n'}
            {err.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#f59e0b', color: '#000', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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
            <ErrorBoundary>
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
            </ErrorBoundary>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
