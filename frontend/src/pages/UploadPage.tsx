import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, FileText, X, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { uploadColumns, uploadForeignKeys, uploadERDiagram, parseSchema } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'

interface SelectedFiles {
  columns: File | null
  fk: File | null
  er: File | null
}

function FilePicker({
  label,
  hint,
  file,
  onSelect,
  onClear,
  required,
}: {
  label: string
  hint: string
  file: File | null
  onSelect: (f: File) => void
  onClear: () => void
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1">
          {label}
          {required && <span style={{ color: 'var(--color-accent)' }}>*</span>}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
          {file ? (
            <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
              <CheckCircle size={11} /> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </span>
          ) : hint}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-3 shrink-0">
        {file && (
          <button onClick={onClear} style={{ color: 'var(--color-muted)' }}>
            <X size={14} />
          </button>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--color-surface2)', color: 'var(--color-text)' }}
        >
          {file ? 'Change' : 'Select file'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.sql,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onSelect(e.target.files[0])}
      />
    </div>
  )
}

function UploadModal({
  onClose,
  onUpload,
}: {
  onClose: () => void
  onUpload: (files: SelectedFiles) => Promise<void>
}) {
  const [files, setFiles] = useState<SelectedFiles>({ columns: null, fk: null, er: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = !!files.columns && !!files.fk

  const handleUpload = async () => {
    if (!canUpload) return
    setLoading(true)
    setError(null)
    try {
      await onUpload(files)
    } catch (e: unknown) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="font-semibold">Upload Schema Files</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Export these from SSMS using the T-SQL extraction scripts
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* File pickers */}
        <div className="p-5 space-y-3">
          <FilePicker
            label="Column Metadata"
            hint="Script 1 output — columns.csv"
            file={files.columns}
            onSelect={(f) => setFiles((s) => ({ ...s, columns: f }))}
            onClear={() => setFiles((s) => ({ ...s, columns: null }))}
            required
          />
          <FilePicker
            label="Foreign Key Relationships"
            hint="Script 2 output — foreign_keys.csv"
            file={files.fk}
            onSelect={(f) => setFiles((s) => ({ ...s, fk: f }))}
            onClear={() => setFiles((s) => ({ ...s, fk: null }))}
            required
          />
          <FilePicker
            label="ER Diagram (optional)"
            hint="PNG or PDF of existing diagram"
            file={files.er}
            onSelect={(f) => setFiles((s) => ({ ...s, er: f }))}
            onClear={() => setFiles((s) => ({ ...s, er: null }))}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: '#450a0a', color: '#fca5a5' }}>
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm"
            style={{ background: 'var(--color-surface2)', color: 'var(--color-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-black"
            style={{ background: canUpload && !loading ? 'var(--color-accent)' : 'var(--color-surface2)', color: canUpload && !loading ? '#000' : 'var(--color-muted)' }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : <><Upload size={14} /> Upload & Continue</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { setParsedSchema } = useSessionStore()
  const [modalOpen, setModalOpen] = useState(false)

  const handleUpload = async (files: SelectedFiles) => {
    if (!sessionId) return
    await uploadColumns(sessionId, files.columns!)
    await uploadForeignKeys(sessionId, files.fk!)
    if (files.er) await uploadERDiagram(sessionId, files.er)
    const result = await parseSchema(sessionId)
    setParsedSchema(result)
    setModalOpen(false)
    navigate(`/session/${sessionId}/context`)
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="max-w-md w-full space-y-6">

          <div className="space-y-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'var(--color-surface)' }}
            >
              <FileText size={26} style={{ color: 'var(--color-accent)' }} />
            </div>
            <h1 className="text-2xl font-bold">Upload your schema files</h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              You'll need two CSV files exported from SQL Server Management Studio —
              one for column metadata and one for foreign key relationships.
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black"
            style={{ background: 'var(--color-accent)' }}
          >
            <Upload size={16} /> Select Files
          </button>

          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Don't have the files yet?{' '}
            <button
              onClick={() => navigate('/extraction-script')}
              className="underline"
              style={{ color: 'var(--color-accent)' }}
            >
              Get the extraction scripts
            </button>
          </p>

        </div>
      </div>

      {modalOpen && (
        <UploadModal
          onClose={() => setModalOpen(false)}
          onUpload={handleUpload}
        />
      )}
    </>
  )
}
