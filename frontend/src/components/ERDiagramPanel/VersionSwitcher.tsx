import { IterationSummary } from '../../store/refinementStore'

interface Props {
  iterations: IterationSummary[]
  currentIterIdx: number
  latestIterIdx: number
  onSwitch: (idx: number) => void
}

export default function VersionSwitcher({ iterations, currentIterIdx, latestIterIdx, onSwitch }: Props) {
  if (iterations.length === 0) return null

  const MAX_VISIBLE = 6
  const visible = iterations.length > MAX_VISIBLE
    ? iterations.slice(iterations.length - MAX_VISIBLE)
    : iterations
  const hiddenCount = iterations.length - visible.length

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {hiddenCount > 0 && (
        <span className="text-xs px-2 py-1 rounded" style={{ color: 'var(--color-muted)' }}>…</span>
      )}
      {visible.map((it) => {
        const isLatest = it.iter_idx === latestIterIdx
        const isCurrent = it.iter_idx === currentIterIdx
        const isRunning = it.status === 'running'
        const isError = it.status === 'error'

        return (
          <button
            key={it.iter_idx}
            onClick={() => onSwitch(it.iter_idx)}
            className="text-xs px-3 py-1 rounded-full font-medium transition-all"
            style={{
              background: isCurrent ? 'var(--color-accent)' : 'var(--color-surface2)',
              color: isCurrent ? '#000' : isError ? 'var(--color-error)' : 'var(--color-muted)',
              border: isRunning ? '1px solid var(--color-warning)' : '1px solid transparent',
              opacity: isRunning && !isCurrent ? 0.7 : 1,
            }}
            title={it.user_comment || 'Initial design'}
          >
            v{it.iter_idx + 1}{isLatest ? '▸' : ''}
            {isRunning && ' ···'}
            {isError && ' ✕'}
          </button>
        )
      })}
    </div>
  )
}
