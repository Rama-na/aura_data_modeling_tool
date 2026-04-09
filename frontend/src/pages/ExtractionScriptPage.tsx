import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Check } from 'lucide-react'

const SCRIPT_1 = `-- Script 1: Table & Column Metadata
-- Run in SSMS against your source database, then export results as CSV
SELECT
    t.TABLE_SCHEMA,
    t.TABLE_NAME,
    c.COLUMN_NAME,
    c.DATA_TYPE,
    c.IS_NULLABLE,
    CASE WHEN kcu.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK,
    p.rows AS ROW_COUNT
FROM INFORMATION_SCHEMA.TABLES t
JOIN INFORMATION_SCHEMA.COLUMNS c
    ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    ON tc.TABLE_SCHEMA = t.TABLE_SCHEMA AND tc.TABLE_NAME = t.TABLE_NAME
    AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    AND kcu.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN sys.partitions p
    ON p.object_id = OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME)
    AND p.index_id IN (0, 1)
WHERE t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION;`

const SCRIPT_2 = `-- Script 2: Foreign Key Relationships
-- Run in SSMS against your source database, then export results as CSV
SELECT
    tp.TABLE_SCHEMA  AS PARENT_SCHEMA,
    tp.TABLE_NAME    AS PARENT_TABLE,
    kcu.COLUMN_NAME  AS PARENT_COLUMN,
    tr.TABLE_SCHEMA  AS REF_SCHEMA,
    tr.TABLE_NAME    AS REF_TABLE,
    kcu2.COLUMN_NAME AS REF_COLUMN
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tp
    ON tp.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tr
    ON tr.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
    ON kcu2.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
    AND kcu2.ORDINAL_POSITION = kcu.ORDINAL_POSITION
ORDER BY tp.TABLE_SCHEMA, tp.TABLE_NAME, kcu.ORDINAL_POSITION;`

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--color-surface2)' }}>
        <span className="text-sm font-medium">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs"
          style={{ background: 'var(--color-surface)', color: copied ? 'var(--color-success)' : 'var(--color-muted)' }}
        >
          {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs mono" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {code}
      </pre>
    </div>
  )
}

export default function ExtractionScriptPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold mb-2">Get your schema files from SQL Server</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>
        Run these T-SQL scripts in SSMS against your source database and export the results as CSV files.
      </p>

      <ol className="space-y-6 mb-10">
        {[
          'Connect to your SQL Server database in SSMS.',
          'Open a new Query window (Ctrl+N).',
          'Paste and run Script 1 below. When complete, right-click the results grid → Save Results As → choose CSV. Name it columns.csv.',
          'Paste and run Script 2 below. Save results as foreign_keys.csv.',
          'Go back to the upload page and drop both files.',
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span
              className="shrink-0 w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold"
              style={{ background: 'var(--color-accent)', color: '#000' }}
            >
              {i + 1}
            </span>
            <span className="text-sm pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-6 mb-8">
        <CodeBlock code={SCRIPT_1} label="Script 1 — Table & Column Metadata" />
        <CodeBlock code={SCRIPT_2} label="Script 2 — Foreign Key Relationships" />
      </div>

      <div className="p-4 rounded-lg text-sm mb-8" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>How to export as CSV in SSMS:</strong> After running a query,
        right-click anywhere in the results grid → Save Results As → Files of type: CSV. Ensure column headers are included
        (default SSMS setting).
      </div>

      <button
        onClick={() => navigate(-1)}
        className="px-5 py-2.5 rounded-lg text-sm font-semibold"
        style={{ background: 'var(--color-accent)', color: '#000' }}
      >
        ← Back to upload
      </button>
    </div>
  )
}
