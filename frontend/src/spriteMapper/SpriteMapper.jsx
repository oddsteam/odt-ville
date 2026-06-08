import { useCallback, useState } from 'react'
import SheetCanvas from './SheetCanvas.jsx'
import PosturePanel from './PosturePanel.jsx'
import AnimPreview from './AnimPreview.jsx'
import {
  POSTURE_SLOTS,
  emptyPostures,
  normalizeManifest,
  saveActiveManifest,
  downloadManifest,
  loadActiveManifest,
} from '../character/manifest.js'

// Character sheets bundled in the repo, with their natural grid sizes.
const BUNDLED = [
  { name: 'scout', path: '/maps/characters/sheets/scout.png', frameW: 32, frameH: 64 },
  { name: 'skeleton', path: '/maps/characters/sheets/skeleton.png', frameW: 32, frameH: 32 },
  { name: 'zombie', path: '/maps/characters/sheets/zombie.png', frameW: 32, frameH: 32 },
]

function loadImageDims(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve({ width: im.naturalWidth, height: im.naturalHeight })
    im.onerror = reject
    im.src = src
  })
}

export default function SpriteMapper() {
  const [sheet, setSheet] = useState(null) // { src, path?, dataUrl?, isBundled, width, height }
  const [grid, setGrid] = useState({ frameW: 32, frameH: 64 })
  const [zoom, setZoom] = useState(1)
  const [postures, setPostures] = useState(emptyPostures())
  const [activeSlot, setActiveSlot] = useState('walkDown')
  const [name, setName] = useState('scout')
  const [frameRate, setFrameRate] = useState(9)
  const [status, setStatus] = useState('')

  const selectBundled = useCallback(async (value) => {
    const b = BUNDLED.find((x) => x.name === value)
    if (!b) return
    try {
      const dims = await loadImageDims(b.path)
      setSheet({ src: b.path, path: b.path, isBundled: true, ...dims })
      setGrid({ frameW: b.frameW, frameH: b.frameH })
      setName(b.name)
      setStatus(`Loaded bundled sheet "${b.name}" (${dims.width}×${dims.height}).`)
    } catch {
      setStatus(`Failed to load ${b.path}.`)
    }
  }, [])

  const onUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const objUrl = URL.createObjectURL(file)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dims = await loadImageDims(objUrl)
        const base = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-z0-9_-]+/gi, '_')
          .toLowerCase()
        setSheet({ src: objUrl, dataUrl: reader.result, isBundled: false, ...dims })
        setName(base || 'character')
        setStatus(`Loaded uploaded sheet (${dims.width}×${dims.height}).`)
      } catch {
        setStatus('Failed to read the uploaded image.')
      }
    }
    reader.readAsDataURL(file)
  }, [])

  function buildManifest() {
    const sheetMeta = sheet.isBundled
      ? { path: sheet.path, width: sheet.width, height: sheet.height }
      : {
          path: `/maps/characters/sheets/${name}.png`,
          width: sheet.width,
          height: sheet.height,
          dataUrl: sheet.dataUrl,
        }
    return normalizeManifest({
      version: 1,
      name,
      sheet: sheetMeta,
      grid: { frameWidth: grid.frameW, frameHeight: grid.frameH },
      render: { originX: 0.5, originY: 1, scale: 1 },
      frameRate: Number(frameRate) || 9,
      postures,
    })
  }

  function requireSheet() {
    if (!sheet) {
      setStatus('Pick a sheet first.')
      return false
    }
    if (!postures.idleDown.length && !postures.walkDown.length) {
      setStatus('Add at least a Down posture (idle or walk) before saving.')
      return false
    }
    return true
  }

  function onSave() {
    if (!requireSheet()) return
    const ok = saveActiveManifest(buildManifest())
    setStatus(
      ok
        ? 'Saved to localStorage — open /map-preview.html to see it live.'
        : 'Save failed (storage full — uploaded sheets are large).',
    )
  }

  function onDownload() {
    if (!requireSheet()) return
    const note = downloadManifest(buildManifest())
    setStatus(note ? `Downloaded JSON. ${note}` : 'Downloaded JSON — commit it under public/maps/characters/.')
  }

  async function onLoadCurrent() {
    const m = await loadActiveManifest()
    const src = m.sheet.dataUrl || m.sheet.path
    if (!src) {
      setStatus('The current manifest has no sheet.')
      return
    }
    setSheet({
      src,
      path: m.sheet.path,
      dataUrl: m.sheet.dataUrl,
      isBundled: !m.sheet.dataUrl,
      width: m.sheet.width,
      height: m.sheet.height,
    })
    setGrid({ frameW: m.grid.frameWidth, frameH: m.grid.frameHeight })
    setName(m.name || 'character')
    setFrameRate(m.frameRate || 9)
    setPostures({ ...emptyPostures(), ...m.postures })
    setStatus(`Loaded current manifest "${m.name}".`)
  }

  const toggleFrame = useCallback(
    (rect) => {
      setPostures((p) => {
        const arr = p[activeSlot] || []
        const idx = arr.findIndex(
          (r) => r.x === rect.x && r.y === rect.y && r.w === rect.w && r.h === rect.h,
        )
        const next = idx >= 0 ? arr.filter((_, i) => i !== idx) : [...arr, rect]
        return { ...p, [activeSlot]: next }
      })
    },
    [activeSlot],
  )

  const removeFrame = useCallback((slot, i) => {
    setPostures((p) => ({ ...p, [slot]: (p[slot] || []).filter((_, idx) => idx !== i) }))
  }, [])

  const clearSlot = useCallback((slot) => {
    setPostures((p) => ({ ...p, [slot]: [] }))
  }, [])

  return (
    <div className="mapper">
      <header className="bar">
        <h1>Character Sprite Mapper</h1>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} size={10} />
        </label>
        <label>
          FPS
          <input
            type="number"
            min={1}
            max={30}
            value={frameRate}
            onChange={(e) => setFrameRate(e.target.value)}
            style={{ width: 48 }}
          />
        </label>
        <button type="button" onClick={onSave}>
          Save (live)
        </button>
        <button type="button" onClick={onDownload}>
          Download JSON
        </button>
        <button type="button" onClick={onLoadCurrent} title="Load the manifest the game is currently using">
          Load current
        </button>
        <a className="open-preview" href="/map-preview.html" target="_blank" rel="noreferrer">
          Open map preview ↗
        </a>
      </header>

      {status && <div className="status">{status}</div>}

      <div className="cols">
        <div className="left">
          <div className="source-bar">
            <label>
              Bundled
              <select defaultValue="" onChange={(e) => selectBundled(e.target.value)}>
                <option value="" disabled>
                  choose…
                </option>
                {BUNDLED.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="upload">
              Upload PNG
              <input type="file" accept="image/png" onChange={onUpload} />
            </label>
            <span className="grid-ctl">
              Frame
              <input
                type="number"
                min={1}
                value={grid.frameW}
                onChange={(e) => setGrid((g) => ({ ...g, frameW: Number(e.target.value) || 1 }))}
                style={{ width: 52 }}
              />
              ×
              <input
                type="number"
                min={1}
                value={grid.frameH}
                onChange={(e) => setGrid((g) => ({ ...g, frameH: Number(e.target.value) || 1 }))}
                style={{ width: 52 }}
              />
            </span>
            <span className="zoom-ctl">
              Zoom
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}>
                −
              </button>
              <span className="zoom-val">{zoom}×</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(6, z + 0.5))}>
                +
              </button>
            </span>
          </div>
          <SheetCanvas
            sheet={sheet}
            grid={grid}
            zoom={zoom}
            frames={postures[activeSlot] || []}
            onToggleFrame={toggleFrame}
          />
        </div>

        <div className="right">
          <div className="preview-box">
            <h3>Preview · {POSTURE_SLOTS.find((s) => s.key === activeSlot)?.label}</h3>
            <AnimPreview
              sheet={sheet}
              frames={postures[activeSlot] || []}
              frameRate={Number(frameRate) || 9}
            />
          </div>
          <PosturePanel
            sheet={sheet}
            postures={postures}
            activeSlot={activeSlot}
            onSelectSlot={setActiveSlot}
            onRemoveFrame={removeFrame}
            onClearSlot={clearSlot}
          />
        </div>
      </div>
    </div>
  )
}
