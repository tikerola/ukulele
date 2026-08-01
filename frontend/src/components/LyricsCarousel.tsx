import { useEffect, useLayoutEffect, useRef } from 'react'

interface Props {
  lyrics?: string
  nextLyrics?: string
  showPreview: boolean
  isLastChordActive: boolean
}

// The section's lines minus its last are rendered as plain static rows; the
// last line gets a bigger "current line" treatment. The peek row below them
// previews the next section's first line by fading in in place — same
// element throughout, just a CSS transition on opacity/transform, so that
// part already reads as continuous motion.
//
// The tricky part is the moment the section itself advances: the line that
// was peeking is now the new section's first (or only) line, but it lives
// in a brand new DOM node at a different position — top of the block
// instead of the peek slot below it. Left alone, that reads as a pop: the
// text disappears from the peek slot and reappears near the top a frame
// later. To avoid that, whichever new line is taking over the "arrived"
// slot is animated there manually (FLIP) from the peek's last known
// position and opacity, so it continues the same motion instead of
// restarting it. Every other line is new content that was never on screen
// before, so it just plays the normal per-line mount fade-in.
export function LyricsCarousel({ lyrics, nextLyrics, showPreview, isLastChordActive }: Props) {
  const lines = lyrics ? lyrics.split('\n') : []
  const precedingLines = lines.slice(0, -1)
  const lastLine = lines.length ? lines[lines.length - 1] : null
  const nextFirstLine = nextLyrics?.split('\n')[0] ?? null
  const peeking = showPreview && isLastChordActive && !!nextFirstLine

  const peekRef = useRef<HTMLDivElement>(null)
  const peekStateRef = useRef<{ rect: DOMRect; opacity: number } | null>(null)
  // Keeps sampling the peek row's own position/opacity every frame for as
  // long as it's peeking, independent of whatever causes this component to
  // re-render — so by the time the section actually advances, the captured
  // state reflects where the peek row has settled (mid fade-in), not
  // wherever it happened to be on the last incidental re-render.
  useEffect(() => {
    if (!peeking) return
    let raf: number
    const tick = () => {
      if (peekRef.current) {
        peekStateRef.current = {
          rect: peekRef.current.getBoundingClientRect(),
          opacity: parseFloat(getComputedStyle(peekRef.current).opacity),
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [peeking])

  const arrivedRef = useRef<HTMLDivElement>(null)
  const prevLyricsRef = useRef(lyrics)
  useLayoutEffect(() => {
    const prevLyrics = prevLyricsRef.current
    prevLyricsRef.current = lyrics
    const el = arrivedRef.current
    // Unchanged section, or first mount: let the normal mount fade-in play.
    if (prevLyrics === lyrics || !el) return

    const from = peekStateRef.current
    peekStateRef.current = null

    el.style.animation = 'none'
    el.style.transition = 'none'
    if (from) {
      const to = el.getBoundingClientRect()
      el.style.transform = `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px)`
      el.style.opacity = String(from.opacity)
    } else {
      // No prior peek to continue from (e.g. the user jumped sections) —
      // fall back to a plain fade/slide instead of popping in unstyled.
      el.style.transform = 'translateY(10px)'
      el.style.opacity = '0'
    }
    el.getBoundingClientRect() // flush the starting styles before animating
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.4s ease, opacity 0.4s ease'
      el.style.transform = ''
      el.style.opacity = ''
    })
  }, [lyrics])

  if (!lyrics && !nextFirstLine) return null

  const arrivedIsPreceding = precedingLines.length > 0

  return (
    <div className="lyrics-carousel">
      <div key={lyrics ?? ''} className="lyrics-carousel-section">
        {precedingLines.map((line, i) => (
          <div
            key={i}
            ref={i === 0 && arrivedIsPreceding ? arrivedRef : undefined}
            className="lyrics-carousel-slide lyrics-carousel-line"
          >
            {line}
          </div>
        ))}
        <div
          ref={arrivedIsPreceding ? undefined : arrivedRef}
          className="lyrics-carousel-slide lyrics-carousel-line lyrics-carousel-current-line"
        >
          {lastLine}
        </div>
      </div>
      {/* Reserved (but invisible) even while not peeking, so revealing it
          never grows this container — which would otherwise push the chord
          grid below it down and back up on every peek. */}
      <div
        ref={peekRef}
        className={`lyrics-carousel-slide lyrics-carousel-line lyrics-carousel-peek${peeking ? ' lyrics-carousel-peek-visible' : ''}`}
      >
        <span className="next-arrow">➤</span> {nextFirstLine}
      </div>
    </div>
  )
}
