import { useCallback, useEffect, useState } from 'react'
import { MonstersService } from '../monsters/service.ts'
import type { MonsterSummary } from '../monsters/schema.ts'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Render a server-computed probability fraction ([0, 1]) as a percent. The
// backend already excludes disabled monsters from the denominator, so disabled
// rows arrive as 0 and the enabled rows sum to 100%.
function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

// Read-only roster for the monster admin (issue #56): the weighted wild-
// encounter pool with each monster's computed probability. Editing / adding /
// toggling land in follow-up issues (#57–#60).
export default function MonstersAdminPage() {
  const [monsters, setMonsters] = useState<readonly MonsterSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setMonsters(await runEdge(MonstersService.list()))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!monsters) return <p className="admin-msg">Loading monsters…</p>

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Monsters</h2>
      {monsters.length === 0 ? (
        <p className="admin-msg">No monsters yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Encounter rate</th>
              <th>Probability</th>
            </tr>
          </thead>
          <tbody>
            {monsters.map((m) => (
              <tr key={m.id} className={m.enabled ? undefined : 'admin-row-off'}>
                <td>{m.name}</td>
                <td>{m.encounter_rate}</td>
                <td>{percent(m.probability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
