import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  lyrics?: string
  nextLyrics?: string
  showPreview: boolean
  isLastChordActive: boolean
  zoom?: number
  // Tallest lyrics block anywhere in the song, in lines. Reserved as this
  // section's own text-block height regardless of how many lines it
  // actually has, so the chord grid below never shifts as playback moves
  // between sections with different lyric line counts.
  maxLines?: number
}

// A line's height is only ever exactly one row (see AutosizeLyricLine) —
// nothing here can push it taller — so this is a hard cap, not just a
// starting minimum: the chord grid below never moves, regardless of lyrics.
const LYRICS_LINE_MIN_SCALE = 0.55

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return node => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(node)
      else (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

// Shrinks this line's own font-size just enough to keep it on one row —
// long lines (a rap verse's lines run much longer than a typical chorus
// line) would otherwise wrap onto a second row, which .lyrics-carousel-line
// and .lyrics-carousel-section's fixed heights don't have room for. Re-measures
// against the CSS class's own (zoom-scaled) base size every time, rather than
// compounding against whatever scale was already applied, so a shorter line
// swapped in later isn't stuck shrunk from a previous long one.
function AutosizeLyricLine({ text, measureKey, className, lineRef }: {
  text: string
  // Bumped by the caller whenever something the measurement depends on
  // changes but `text` itself doesn't — zoom, or the container being
  // resized — to force a re-measure.
  measureKey: number | string
  className: string
  lineRef?: React.Ref<HTMLDivElement>
}) {
  const localRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = localRef.current
    if (!el) return
    el.style.fontSize = ''
    const natural = el.scrollWidth
    const available = el.clientWidth
    if (available > 0 && natural > available) {
      const base = parseFloat(getComputedStyle(el).fontSize)
      const scale = Math.max(LYRICS_LINE_MIN_SCALE, available / natural)
      el.style.fontSize = `${base * scale}px`
    }
  }, [text, measureKey])

  return (
    <div ref={mergeRefs(localRef, lineRef)} className={className}>
      {text}
    </div>
  )
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
export function LyricsCarousel({ lyrics, nextLyrics, showPreview, isLastChordActive, zoom = 1, maxLines = 1 }: Props) {
  const lines = lyrics ? lyrics.split('\n') : []
  const precedingLines = lines.slice(0, -1)
  const lastLine = lines.length ? lines[lines.length - 1] : null
  const nextFirstLine = nextLyrics?.split('\n')[0] ?? null
  const peeking = showPreview && isLastChordActive && !!nextFirstLine

  const containerRef = useRef<HTMLDivElement>(null)
  // Bumped on every resize of the lyrics block itself (window resize, chord
  // zoom changing the layout width, sidebar toggling, etc.) so every line's
  // autosize effect re-measures against the new available width — a line
  // that fit fine before a resize could now be too wide, or vice versa.
  const [resizeGen, setResizeGen] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setResizeGen(g => g + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  // Always renders (never unmounts) once the song has lyrics anywhere —
  // SectionChordBoard only mounts this component at all when the song has
  // lyrics somewhere (see its `hasLyrics` gate). A section with no lyrics of
  // its own, and nothing upcoming to peek at, still renders this block with
  // an empty current-line slot. Combined with .lyrics-carousel-section's
  // fixed height below (sized off `maxLines`, the tallest lyrics block in
  // the song), this section's text block always reserves exactly the same
  // height as the song's biggest one — whether it has zero lines, one line,
  // or the max — so the chord grid below it never shifts as playback moves
  // between sections, no matter how long any line's text is (AutosizeLyricLine
  // keeps every line to one row, and the fixed height + overflow:hidden below
  // is a hard backstop even so).
  const arrivedIsPreceding = precedingLines.length > 0

  return (
    <div
      ref={containerRef}
      className="lyrics-carousel"
      style={{ ['--lyrics-zoom' as string]: zoom, ['--lyrics-max-lines' as string]: maxLines }}
    >
      <div key={lyrics ?? ''} className="lyrics-carousel-section">
        {precedingLines.map((line, i) => (
          <AutosizeLyricLine
            key={i}
            text={line}
            measureKey={`${zoom}:${resizeGen}`}
            lineRef={i === 0 && arrivedIsPreceding ? arrivedRef : undefined}
            className="lyrics-carousel-slide lyrics-carousel-line"
          />
        ))}
        <AutosizeLyricLine
          text={lastLine ?? ''}
          measureKey={`${zoom}:${resizeGen}`}
          lineRef={arrivedIsPreceding ? undefined : arrivedRef}
          className="lyrics-carousel-slide lyrics-carousel-line lyrics-carousel-current-line"
        />
      </div>
      {/* Reserved (but invisible) even while not peeking, so revealing it
          never grows this container — which would otherwise push the chord
          grid below it down and back up on every peek. */}
      <AutosizeLyricLine
        text={nextFirstLine ?? ''}
        measureKey={`${zoom}:${resizeGen}`}
        lineRef={peekRef}
        className={`lyrics-carousel-slide lyrics-carousel-line lyrics-carousel-peek${peeking ? ' lyrics-carousel-peek-visible' : ''}`}
      />
    </div>
  )
}
