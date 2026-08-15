import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { CharacterService } from './service.ts'
import { buildLookData, type LookSelection } from './look.ts'
import { runEdge } from '../lib/runEdge.ts'
import type { ManifestSummary } from './schema.ts'

// The deliberately ugly Look builder (#398): five <select>s + Save, proving the
// persistence loop (POST → cap of 3 → wear → render) end-to-end. #399 replaces
// this with the real, designed picker; the plumbing underneath stays.
const PACK = 'modern-interiors'
const LAYOUT_URL = `/maps/characters/packs/${PACK}/layout.json`

// A curated slice of the pack's real part names per slot — enough distinct
// Looks to prove the loop by hand. #399 lists the whole pack by style + variant.
const OPTIONS = {
  body: ['body-01', 'body-02', 'body-03', 'body-04', 'body-05', 'body-06', 'body-07', 'body-08', 'body-09'],
  eyes: ['eyes-01', 'eyes-02', 'eyes-03', 'eyes-04', 'eyes-05', 'eyes-06', 'eyes-07'],
  outfit: ['outfit-01-01', 'outfit-10-04', 'outfit-10-05', 'outfit-12-01', 'outfit-24-01'],
  hairstyle: ['hairstyle-01-01', 'hairstyle-02-06', 'hairstyle-10-06', 'hairstyle-12-03', 'hairstyle-24-02', 'hairstyle-26-06', 'hairstyle-28-02'],
  accessory: ['accessory-01-02', 'accessory-02-01', 'accessory-03-07', 'accessory-13-02'],
} as const

const SLOTS: { key: keyof LookSelection; label: string; required: boolean }[] = [
  { key: 'body', label: 'Body', required: true },
  { key: 'eyes', label: 'Eyes', required: true },
  { key: 'outfit', label: 'Outfit', required: false },
  { key: 'hairstyle', label: 'Hairstyle', required: false },
  { key: 'accessory', label: 'Accessory', required: false },
]

const EMPTY = { body: '', eyes: '', outfit: '', hairstyle: '', accessory: '' }

// A 422 from the cap/slot rules renders `{ error }` — surface that message
// verbatim so the user sees "You can keep at most three Looks", not a stack.
function serverMessage(err: unknown, fallback: string) {
  const body = (err as { body?: string })?.body
  if (body) {
    try {
      return JSON.parse(body).error ?? fallback
    } catch {
      /* not JSON — fall through */
    }
  }
  return err instanceof Error ? err.message : fallback
}

export default function LookBuilderPage() {
  const [pick, setPick] = useState<Record<keyof LookSelection, string>>(EMPTY)
  const [layout, setLayout] = useState<unknown>(null)
  const [mine, setMine] = useState<readonly ManifestSummary[]>([])
  const [wornId, setWornId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [looks, worn] = await Promise.all([
      runEdge(CharacterService.listMine()),
      runEdge(CharacterService.getForMe()).catch(() => null),
    ])
    setMine(looks)
    setWornId(worn?.id ?? null)
  }, [])

  useEffect(() => {
    fetch(LAYOUT_URL).then((r) => r.json()).then(setLayout).catch(() => setError('Could not load the part pack.'))
    refresh().catch((e) => setError(serverMessage(e, 'Could not load your Looks.')))
  }, [refresh])

  const save = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = buildLookData(
        { body: pick.body, eyes: pick.eyes, outfit: pick.outfit, hairstyle: pick.hairstyle, accessory: [pick.accessory] },
        layout,
      )
      const saved = await runEdge(CharacterService.saveLook(data))
      await runEdge(CharacterService.select(saved.id))
      setPick(EMPTY)
      await refresh()
    } catch (e) {
      setError(serverMessage(e, 'Could not save the Look.'))
    } finally {
      setBusy(false)
    }
  }, [pick, layout, refresh])

  const act = useCallback(
    async (run: Promise<unknown>, fail: string) => {
      setBusy(true)
      setError('')
      try {
        await run
        await refresh()
      } catch (e) {
        setError(serverMessage(e, fail))
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const canSave = pick.body !== '' && pick.eyes !== '' && layout !== null && !busy

  return (
    <div className="char-select">
      <div className="char-select-head">
        <h2>Build a Look</h2>
        <Link to="/">← Back to the village</Link>
      </div>
      <p className="char-select-hint">
        Pick your parts and Save — it becomes your character in the village. You can keep three.
      </p>

      {error && <div className="char-select-error">{error}</div>}

      <div className="look-form">
        {SLOTS.map(({ key, label, required }) => (
          <label key={key}>
            {label}
            {required ? ' *' : ''}
            <select value={pick[key]} onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}>
              <option value="">{required ? '— pick one —' : '— none —'}</option>
              {OPTIONS[key].map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        ))}
        <button type="button" onClick={save} disabled={!canSave}>Save &amp; wear</button>
      </div>

      <h3>Your Looks ({mine.length}/3)</h3>
      {!mine.length && <p>No Looks yet.</p>}
      <ul className="look-list">
        {mine.map((m) => (
          <li key={m.id}>
            <span>{m.name}{m.id === wornId ? ' — worn' : ''}</span>
            <button type="button" disabled={busy || m.id === wornId} onClick={() => act(runEdge(CharacterService.select(m.id)), 'Could not wear it.')}>
              Wear
            </button>
            <button type="button" disabled={busy} onClick={() => act(runEdge(CharacterService.deleteLook(m.id)), 'Could not delete it.')}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
