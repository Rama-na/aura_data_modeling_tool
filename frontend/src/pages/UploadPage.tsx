import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, CheckCircle, X, Loader2 } from 'lucide-react'
import { uploadColumns, uploadForeignKeys, uploadERDiagram, parseSchema } from '../api/sessions'
import { useSessionStore } from '../store/sessionStore'

function DropZone({
  label, hint, file, onDrop, onRemove
}: {
  label: string; hint: string; file: File | null
  onDrop: (f: File) => void; onRemove: () => void
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onDrop(files[0]),
    accept: { 'text/csv': ['.csv'], 'application/sql': ['.sql'], 'text/plain': ['.sql', '.csv'] },
    multiple: false,
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium mb-1">{label}</div>
      {file ? (
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-success)' }}>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
            <span className="mono">{file.name}</span>
            <span style={{ color: 'var(--color-muted)' }}>({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
          <button onClick={onRemove} style={{ color: 'var(--color-muted)' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className="rounded-xl p-8 text-center cursor-pointer transition-colors"
          style={{
            border: `2px dashed ${isDragActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
            background: isDragActive ? 'var(--color-accent-dim)' : 'var(--color-surface)',
          }}
        >
          <input {...getInputProps()} />
          <Upload size={24} style={{ color: 'var(--color-muted)' }} className="mx-auto mb-2" />
          <div className="text-sm font-medium">Drag & drop or <span style={{ color: 'var(--color-accent)' }}>browse</span></div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>{hint}</div>
        </div>
      )}
    </div>
  )
}

export default function UploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { setParsedSchema } = useSessionStore()

  const [columnsFile, setColumnsFile] = useState<File | null>(null)
  const [fkFile, setFkFile] = useState<File | null>(null)
  const [erFile, setErFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProceed = !!columnsFile && !!fkFile

  const handleParse = async () => {
    if (!sessionId || !canProceed) return
    setLoading(true)
    setError(null)
    try {
      await uploadColumns(sessionId, columnsFile!)
      await uploadForeignKeys(sessionId, fkFile!)
      if (erFile) await uploadERDiagram(sessionId, erFile)
      const result = await parseSchema(sessionId)
      setParsedSchema(result)
      navigate(`/session/${sessionId}/context`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="text-sm mb-6" style={{ color: 'var(--color-muted)' }}>Step 1 of 5 — Upload your schema files</div>
      <h1 className="text-2xl font-bold mb-8">Upload SQL Server Schema Files</h1>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <DropZone
          label="Table & Column Metadata"
          hint=".csv or .sql — from Script 1"
          file={columnsFile}
          onDrop={setColumnsFile}
          onRemove={() => setColumnsFile(null)}
        />
        <DropZone
          label="Foreign Key Relationships"
          hint=".csv or .sql — from Script 2"
          file={fkFile}
          onDrop={setFkFile}
          onRemove={() => setFkFile(null)}
        />
      </div>

      {/* Optional ER diagram */}
      <details className="mb-8">
        <summary className="text-sm cursor-pointer" style={{ color: 'var(--color-muted)' }}>
          Upload existing ER diagram (optional — provides AI context)
        </summary>
        <div className="mt-4">
          <DropZone
            label="ER Diagram (PNG or PDF)"
            hint="Optional — gives the AI a visual reference"
            file={erFile}
            onDrop={setErFile}
            onRemove={() => setErFile(null)}
          />
        </div>
      </details>

      {/* Extraction script hint */}
      <details className="mb-8 p-4 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <summary className="text-sm cursor-pointer font-medium">Not sure how to get these files?</summary>
        <p className="text-sm mt-3" style={{ color: 'var(--color-muted)' }}>
          Run the provided T-SQL scripts in SSMS against your source database and export the results as CSV.
          <button onClick={() => navigate('/extraction-script')} className="ml-1" style={{ color: 'var(--color-accent)' }}>
            Get the scripts →
          </button>
        </p>
      </details>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleParse}
        disabled={!canProceed || loading}
        className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black disabled:opacity-40"
        style={{ background: canProceed ? 'var(--color-accent)' : 'var(--color-surface2)' }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Parsing your schema...</> : 'Parse & Continue →'}
      </button>
    </div>
  )
}
