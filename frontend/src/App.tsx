import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SessionSidebar from './components/Sidebar/SessionSidebar'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import ContextPage from './pages/ContextPage'
import PipelinePage from './pages/PipelinePage'
import RefinementPage from './pages/RefinementPage'
import SummaryPage from './pages/SummaryPage'
import ExtractionScriptPage from './pages/ExtractionScriptPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg)' }}>
          <SessionSidebar />
          <main className="flex-1 overflow-y-auto">
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
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
