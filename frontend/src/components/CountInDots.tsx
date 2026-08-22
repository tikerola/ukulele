import { useLayoutEffect, useRef } from 'react'
import { ChordDiagram } from './ChordDiagram'
import type { ChordEntry } from '../types'

interface Props {
  entries: ChordEntry[]
  currentTime: number
  firstChordTime: number
  chordSize: number
}

// ChordDiagram draws its chord-name text at font-size 20 (SVG viewBox
// units), baseline 5 units above the diagram's own bottom edge — see
// ChordDiagram.tsx. Both scale by `size` exactly like the rest of the
// diagram. Below the diagram sits the same 4px card padding-bottom, 13px
// dot + 9px margin-top beat-dots row, and 4px + 6px progress-track every
// real card has (App.css .chord-row-item/.beat-dots/.chord-progress-track)
// — so this reproduces exactly where a real card's name sits relative to
// its own beat-dots, just above the count-in dot instead.
const NAME_FONT_SIZE = 20
const NAME_BASELINE_FROM_DIAGRAM_BOTTOM = 5
const CARD_BOTTOM_STACK = 4 + (13 + 9) + (4 + 6)

// A single invisible chord card (same spacer/track trick as before, for
// vertical alignment with a real card's beat-dot) holding one dot and one
// number, both of which change in place as each count-in beat is reached
// — a metronome tick, not a row of per-beat history dots.
export function CountInDots({ entries, currentTime, firstChordTime, chordSize }: Props) {
  const inCountInPhase = currentTime < firstChordTime
  let activeIdx = -1
  if (inCountInPhase) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (currentTime >= entries[i].time) { activeIdx = i; break }
    }
  }

  const dotRef = useRef<HTMLSpanElement | null>(null)
  const lastIdxRef = useRef(-1)

  // Restarts the blink animation on the same element each time playback
  // reaches a new beat, the same remove/reflow/re-add trick ChordOverlay
  // uses for its own beat-pulse — necessary because React won't replay a
  // CSS animation just from the class staying the same string across
  // renders.
  useLayoutEffect(() => {
    if (activeIdx === -1 || activeIdx === lastIdxRef.current) return
    lastIdxRef.current = activeIdx
    const el = dotRef.current
    if (el) {
      el.classList.remove('count-in-dot-blink')
      void el.offsetWidth
      el.classList.add('count-in-dot-blink')
    }
  }, [activeIdx])

  if (!inCountInPhase || entries.length === 0) return null

  const started = activeIdx !== -1
  const number = started ? entries.length - activeIdx : entries.length
  const numberFontSize = NAME_FONT_SIZE * chordSize
  const numberBottom = CARD_BOTTOM_STACK + NAME_BASELINE_FROM_DIAGRAM_BOTTOM * chordSize

  return (
    <div className="chord-row-item count-in-slot">
      <div className="count-in-spacer" aria-hidden="true">
        <ChordDiagram chord="" data={null} size={chordSize} accentHeight={13.3} nameFontSize={20} />
      </div>
      <span
        className={`count-in-number${started ? ' count-in-number-passed' : ''}`}
        style={{ fontSize: numberFontSize, bottom: numberBottom }}
      >
        {number}
      </span>
      <div className="chord-progress-track">
        <div className="chord-progress-fill" />
        <div className="chord-progress-ticks"><span /><span /><span /><span /></div>
      </div>
      <div className="beat-dots">
        <span ref={dotRef} className={`beat-dot${started ? ' beat-dot-lit' : ' beat-dot-empty'}`} />
      </div>
    </div>
  )
}
