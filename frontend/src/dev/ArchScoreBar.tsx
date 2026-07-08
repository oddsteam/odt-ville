import { useEffect, useState } from 'react'

// Dev-only floating readout of "architecture alignment": how closely the module
// graph matches the rules in .dependency-cruiser.cjs. 100% = every dependency
// edge obeys the target architecture; lower = more edges break a rule. The
// number comes from the /__arch-score dev endpoint (see vite.config.js), which
// runs dependency-cruiser on request. Rendered only behind import.meta.env.DEV
// (RootLayout), so it and the endpoint drop out of production builds.
type Score = {
  score: number
  violations: number
  dependencies: number
  modules: number
  rules: Record<string, number>
  error?: string
}

function color(pct: number) {
  if (pct >= 95) return '#3fb950'
  if (pct >= 80) return '#d29922'
  return '#f85149'
}

export default function ArchScoreBar() {
  const [data, setData] = useState<Score | null>(null)
  const [failed, setFailed] = useState(false)

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
  const tip = data
    ? Object.entries(data.rules)
        .map(([r, n]) => `${n}× ${r}`)
        .join('\n') || 'no violations 🎉'
    : 'measuring…'

  return (
    <div
      title={tip}
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 9999,
        width: 210,
        padding: '6px 10px',
        borderRadius: 8,
        font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#e6edf3',
        background: 'rgba(13,17,23,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span>ARCH ALIGN</span>
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
    </div>
  )
}
