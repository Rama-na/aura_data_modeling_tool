import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Check } from 'lucide-react'

const DDL_SCRIPT = `-- DDL Extraction Script
-- Run in SSMS against your source database.
-- It generates CREATE TABLE statements with PRIMARY KEY and FOREIGN KEY constraints.
-- Save the output as a .sql file and upload it to Aura Data Modeler.

DECLARE @sql NVARCHAR(MAX) = '';

-- Generate CREATE TABLE statements
SELECT @sql += 'CREATE TABLE [' + t.TABLE_SCHEMA + '].[' + t.TABLE_NAME + '] (' + CHAR(13) +
    STUFF((
        SELECT ', ' + CHAR(13) + '    [' + c.COLUMN_NAME + '] ' +
               c.DATA_TYPE +
               CASE
                 WHEN c.DATA_TYPE IN ('nvarchar','nchar','varchar','char') AND c.CHARACTER_MAXIMUM_LENGTH IS NOT NULL
                   THEN '(' + CASE WHEN c.CHARACTER_MAXIMUM_LENGTH = -1 THEN 'MAX' ELSE CAST(c.CHARACTER_MAXIMUM_LENGTH AS VARCHAR) END + ')'
                 WHEN c.DATA_TYPE IN ('decimal','numeric') AND c.NUMERIC_PRECISION IS NOT NULL
                   THEN '(' + CAST(c.NUMERIC_PRECISION AS VARCHAR) + ',' + CAST(ISNULL(c.NUMERIC_SCALE,0) AS VARCHAR) + ')'
                 ELSE ''
               END +
               CASE WHEN c.IS_NULLABLE = 'NO' THEN ' NOT NULL' ELSE ' NULL' END +
               CASE WHEN c.COLUMN_DEFAULT IS NOT NULL THEN ' DEFAULT ' + c.COLUMN_DEFAULT ELSE '' END
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
        ORDER BY c.ORDINAL_POSITION
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '    ') +
    CHAR(13) + ');' + CHAR(13) + CHAR(13)
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;

-- Add PRIMARY KEY constraints
SELECT @sql += 'ALTER TABLE [' + kcu.TABLE_SCHEMA + '].[' + kcu.TABLE_NAME + ']' + CHAR(13) +
    '    ADD CONSTRAINT [' + tc.CONSTRAINT_NAME + '] PRIMARY KEY (' +
    STUFF((
        SELECT ', [' + k2.COLUMN_NAME + ']'
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k2
        WHERE k2.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          AND k2.TABLE_SCHEMA = tc.TABLE_SCHEMA
        ORDER BY k2.ORDINAL_POSITION
        FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '') +
    ');' + CHAR(13) + CHAR(13)
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
  AND kcu.ORDINAL_POSITION = 1;

-- Add FOREIGN KEY constraints
SELECT @sql += 'ALTER TABLE [' + tp.TABLE_SCHEMA + '].[' + tp.TABLE_NAME + ']' + CHAR(13) +
    '    ADD CONSTRAINT [' + rc.CONSTRAINT_NAME + '] FOREIGN KEY ([' + kcu.COLUMN_NAME + '])' + CHAR(13) +
    '    REFERENCES [' + tr.TABLE_SCHEMA + '].[' + tr.TABLE_NAME + '] ([' + kcu2.COLUMN_NAME + ']);' + CHAR(13) + CHAR(13)
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tp ON tp.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tr ON tr.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
    ON kcu2.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
    AND kcu2.ORDINAL_POSITION = kcu.ORDINAL_POSITION;

-- Print the result (copy from Messages tab)
PRINT @sql;`

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
      <pre className="p-4 overflow-x-auto text-xs" style={{ background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'monospace' }}>
        {code}
      </pre>
    </div>
  )
}

export default function ExtractionScriptPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold mb-2">Extract your SQL Server schema</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>
        Run this T-SQL script in SSMS to generate a DDL file that Aura can parse automatically.
        The script outputs CREATE TABLE statements with all primary and foreign key constraints.
      </p>

      <ol className="space-y-4 mb-10">
        {[
          'Open SQL Server Management Studio and connect to your database.',
          'Open a new Query window (Ctrl+N) and select your source database from the dropdown.',
          'Paste and run the script below.',
          'In the Messages tab (not Results), you will see the generated DDL. Select all, copy it.',
          'Paste into a new file and save it with a .sql extension (e.g. schema.sql).',
          'Upload the .sql file on the Upload page.',
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
        <CodeBlock code={DDL_SCRIPT} label="DDL Extraction Script" />
      </div>

      <div className="p-4 rounded-lg text-sm mb-8" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>Tip:</strong> You can also upload any existing DDL scripts
        you already have — migration files, table creation scripts, etc. Aura accepts any .sql file with
        CREATE TABLE statements. You can upload multiple files at once.
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
