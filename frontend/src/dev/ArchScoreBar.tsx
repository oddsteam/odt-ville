import { useEffect, useState } from 'react'

// Dev-only floating readout of "architecture alignment": how closely the module
// graph matches the rules in .dependency-cruiser.cjs. 100% = every dependency
// edge obeys the target architecture; lower = more edges break a rule. The
// number comes from the /__arch-score dev endpoint (see vite.config.js), which
// runs dependency-cruiser on request. Rendered only behind import.meta.env.DEV
// (RootLayout), so it and the endpoint drop out of production builds. Click the
// bar to expand the worst-offending modules.
type Edge = { to: string; rule: string }
type Offender = { from: string; count: number; edges: Edge[] }
type Score = {
  score: number
  violations: number
  dependencies: number
  modules: number
  rules: Record<string, number>
  offenders: Offender[]
  error?: string
}

function color(pct: number) {
  if (pct >= 95) return '#3fb950'
  if (pct >= 80) return '#d29922'
  return '#f85149'
}

// Trim the `src/` prefix so paths fit the narrow panel.
const short = (p: string) => p.replace(/^src\//, '')

export default function ArchScoreBar() {
  const [data, setData] = useState<Score | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/__arch-score')
      .then((r) => r.json())
      .then((d: Score) => {
        if (!active) return
        if (d.error) setFailed(true)
        else setData(d)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  if (failed) return null

  const pct = data ? data.score : null

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 9999,
        width: 240,
        font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#e6edf3',
        background: 'rgba(13,17,23,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!data}
        title={data ? 'Click for the worst-offending modules' : undefined}
        style={{
          all: 'unset',
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          padding: '6px 10px',
          cursor: data ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span>
            {data ? (open ? '▾ ' : '▸ ') : ''}ARCH ALIGN
          </span>
          <strong style={{ color: pct == null ? '#8b949e' : color(pct) }}>
            {pct == null ? '…' : `${pct}%`}
          </strong>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct ?? 0}%`,
              background: pct == null ? '#8b949e' : color(pct),
              transition: 'width .4s ease',
            }}
          />
        </div>
        {data && (
          <div style={{ marginTop: 4, color: '#8b949e' }}>
            {data.violations} violations · {data.dependencies} deps
          </div>
        )}
      </button>

      {open && data && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.12)',
            padding: '6px 10px',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {data.offenders.length === 0 && (
            <div style={{ color: '#3fb950' }}>no violations 🎉</div>
          )}
          {data.offenders.map((o) => (
            <div key={o.from} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: color(100 - o.count * 8), fontWeight: 700 }}>
                  {o.count}
                </span>
                <span style={{ wordBreak: 'break-all' }}>{short(o.from)}</span>
              </div>
              {o.edges.map((e, i) => (
                <div
                  key={i}
                  style={{
                    color: '#8b949e',
                    paddingLeft: 14,
                    wordBreak: 'break-all',
                  }}
                  title={e.rule}
                >
                  → {short(e.to)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
