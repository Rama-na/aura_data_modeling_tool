import type { IterationSummary } from '../../store/refinementStore'

interface Props {
  iterations: IterationSummary[]
}

export default function RevisionHistory({ iterations }: Props) {
  const withComments = iterations.filter((it) => it.user_comment)
  if (withComments.length === 0) return null

  return (
    <div className="space-y-2">
      {withComments.map((it) => (
        <div key={it.iter_idx} className="text-xs">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium" style={{ color: 'var(--color-accent)' }}>v{it.iter_idx} → v{it.iter_idx + 1}</span>
            <span style={{ color: 'var(--color-muted)' }}>
              {new Date(it.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {it.status === 'running' && (
              <span className="animate-pulse" style={{ color: 'var(--color-warning)' }}>[running…]</span>
            )}
            {it.status === 'error' && (
              <span style={{ color: 'var(--color-error)' }}>[failed]</span>
            )}
          </div>
          <p className="pl-3 italic" style={{ color: 'var(--color-muted)' }}>"{it.user_comment}"</p>
        </div>
      ))}
    </div>
  )
}
