// A YouTube popup rendered as a DOM overlay on top of the Phaser canvas.
// Phaser draws to a <canvas>, which can't contain an <iframe>, so the video
// lives in a plain DOM modal layered over the game. Only one is open at a time.
//
// Closing removes the iframe entirely (not just hides it) so playback/audio
// stops. Esc, the × button, and a backdrop click all dismiss it.

let active = null

export function openVideoModal({ videoId, start = 0, title = 'Video', onClose } = {}) {
  closeVideoModal()

  const backdrop = document.createElement('div')
  backdrop.className = 'video-modal-backdrop'

  const box = document.createElement('div')
  box.className = 'video-modal'

  const close = document.createElement('button')
  close.className = 'video-modal-close'
  close.type = 'button'
  close.setAttribute('aria-label', 'Close video')
  close.textContent = '×'

  const frameWrap = document.createElement('div')
  frameWrap.className = 'video-modal-frame'

  const iframe = document.createElement('iframe')
  const params = new URLSearchParams({
    autoplay: '1',
    rel: '0',
    start: String(Math.max(0, Math.floor(start))),
  })
  iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  iframe.title = title
  iframe.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.allowFullscreen = true

  frameWrap.appendChild(iframe)
  box.appendChild(close)
  box.appendChild(frameWrap)
  backdrop.appendChild(box)
  document.body.appendChild(backdrop)

  const dismiss = () => {
    closeVideoModal()
    onClose?.()
  }
  close.addEventListener('click', dismiss)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) dismiss()
  })
  const onKey = (e) => {
    if (e.key === 'Escape') dismiss()
  }
  document.addEventListener('keydown', onKey)

  active = { backdrop, onKey }
}

export function closeVideoModal() {
  if (!active) return
  document.removeEventListener('keydown', active.onKey)
  active.backdrop.remove() // drops the iframe → stops playback
  active = null
}
