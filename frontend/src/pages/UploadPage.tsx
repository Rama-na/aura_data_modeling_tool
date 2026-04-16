import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, FileText, X, CheckCircle, Loader2, AlertCircle, Plus } from 'lucide-react'
import { uploadSqlFiles, uploadERDiagram, parseSchema } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'

function SqlFileList({
  files,
  onAdd,
  onRemove,
}: {
  files: File[]
  onAdd: (newFiles: File[]) => void
  onRemove: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium flex items-center gap-1">
            SQL DDL Files
            <span style={{ color: 'var(--color-accent)' }}>*</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            One or more .sql files containing CREATE TABLE statements
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--color-surface2)', color: 'var(--color-text)' }}
        >
          <Plus size={12} /> Add files
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".sql,.txt"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onAdd(Array.from(e.target.files))
            e.target.value = ''
          }
        }}
      />

      {files.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed text-sm cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
          onClick={() => inputRef.current?.click()}
        >
          <FileText size={20} className="mb-1.5" style={{ color: 'var(--color-accent)' }} />
          Click to select .sql files
        </div>
      ) : (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
            >
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-success)' }}>
                <CheckCircle size={11} />
                <span className="truncate max-w-[220px]">{f.name}</span>
                <span style={{ color: 'var(--color-muted)' }}>({(f.size / 1024).toFixed(1)} KB)</span>
              </span>
              <button onClick={() => onRemove(i)} style={{ color: 'var(--color-muted)' }} className="ml-2 shrink-0">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ErFilePicker({
  file,
  onSelect,
  onClear,
}: {
  file: File | null
  onSelect: (f: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">ER Diagram <span className="text-xs font-normal" style={{ color: 'var(--color-muted)' }}>(optional)</span></div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
          {file ? (
            <span className="flex items-center gap-1" style={{ color: 'var(--color-success)' }}>
              <CheckCircle size={11} /> {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </span>
          ) : 'PNG or PDF of existing diagram'}
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
        accept=".png,.jpg,.jpeg,.pdf"
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
  onUpload: (sqlFiles: File[], erFile: File | null) => Promise<void>
}) {
  const [sqlFiles, setSqlFiles] = useState<File[]>([])
  const [erFile, setErFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = sqlFiles.length > 0

  const handleAddSql = (newFiles: File[]) => {
    setSqlFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      const unique = newFiles.filter((f) => !existing.has(f.name))
      return [...prev, ...unique]
    })
  }

  const handleRemoveSql = (index: number) => {
    setSqlFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (!canUpload) return
    setLoading(true)
    setError(null)
    try {
      await onUpload(sqlFiles, erFile)
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
            <h2 className="font-semibold">Upload SQL Schema</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Upload your SQL Server DDL scripts (.sql files)
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* File pickers */}
        <div className="p-5 space-y-4">
          <SqlFileList
            files={sqlFiles}
            onAdd={handleAddSql}
            onRemove={handleRemoveSql}
          />
          <ErFilePicker
            file={erFile}
            onSelect={setErFile}
            onClear={() => setErFile(null)}
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
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
            style={{
              background: canUpload && !loading ? 'var(--color-accent)' : 'var(--color-surface2)',
              color: canUpload && !loading ? '#000' : 'var(--color-muted)',
            }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : <><Upload size={14} /> Upload & Analyse</>
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

  const handleUpload = async (sqlFiles: File[], erFile: File | null) => {
    if (!sessionId) return
    await uploadSqlFiles(sessionId, sqlFiles)
    if (erFile) await uploadERDiagram(sessionId, erFile)
    const result = await parseSchema(sessionId)
    setParsedSchema(result.parsed_schema)
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
            <h1 className="text-2xl font-bold">Upload your SQL schema</h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Upload one or more .sql files containing your SQL Server CREATE TABLE statements.
              The AI will parse your schema and infer all relationships automatically.
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black"
            style={{ background: 'var(--color-accent)' }}
          >
            <Upload size={16} /> Select SQL Files
          </button>

          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Don't have SQL DDL files?{' '}
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
