import { useEffect, useState } from 'react'
import { EmployeesService } from './service.ts'
import type { BasecampPerson } from './schema.ts'
import { runEdge } from '../lib/runEdge.ts'

// Server-side name search over the Basecamp roster (#392): the operator types a
// name, confirms by face, and picks. The roster is never handed to the browser
// wholesale and the signed avatar URL never at all (ADR-0012) — each face
// arrives as inlined bytes. Debounced, and a short query stays quiet, so a
// keystroke is not a request.
export function BasecampPersonPicker({ onPick }: { onPick: (basecampPersonId: number) => void }) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<readonly BasecampPerson[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setPeople([])
      return
    }
    const timer = setTimeout(() => {
      runEdge(EmployeesService.searchBasecampPeople(q)).then(setPeople, (e: Error) => setError(e.message))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div>
      <input
        autoFocus
        placeholder="Search Basecamp by name…"
        value={q}
        onChange={(e) => {
          setError(null)
          setQ(e.target.value)
        }}
      />
      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      <ul style={{ listStyle: 'none', margin: '0.25rem 0', padding: 0 }}>
        {people.map((p) => (
          <li key={p.id} style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', padding: '0.15rem 0' }}>
            {/* alt="" — the name beside it is the label; the face is confirmation. */}
            {p.avatar ? (
              <img src={p.avatar} alt="" height={24} width={24} style={{ borderRadius: '50%' }} />
            ) : (
              <span style={{ display: 'inline-block', height: 24, width: 24 }} />
            )}
            <span style={{ flex: 1 }}>{p.name}</span>
            <button type="button" onClick={() => onPick(p.id)}>
              Pick
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
