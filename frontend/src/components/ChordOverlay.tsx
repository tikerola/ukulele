import { useLayoutEffect, useRef } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { CountInDots } from './CountInDots'
import { useChordSync } from '../hooks/useChordSync'
import { restartChordProgress } from '../lib/chordProgress'
import { computeBeatDots } from '../lib/beatDots'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
  showNextPreview?: boolean
  countInEntries?: ChordEntry[]
  chordZoom?: number
}

const BASE_CHORD_SIZE = 1.82
const BASE_CHORD_ROW_GAP = 28

export function ChordOverlay({ timeline, currentTime, chordDict, onPulse, showNextPreview = true, countInEntries, chordZoom = 1 }: Props) {
  const CHORD_SIZE = BASE_CHORD_SIZE * chordZoom
  const { currentIdx, batchGroups, activeGroupIdxInBatch, activeChordEndTime, isLastInBatch, nextChord } = useChordSync(timeline, currentTime)
  // The very first batch is the one whose first group starts at raw entry 0
  // — count-in only ever leads into the song's first chord, so it rides
  // along with that batch and scrolls out of view once playback moves on.
  const showCountIn = !!countInEntries?.length && !!batchGroups[0]?.includes(0)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastIdxRef = useRef(-1)
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  useLayoutEffect(() => {
    if (currentIdx === -1 || currentIdx === lastIdxRef.current) return
    lastIdxRef.current = currentIdx

    if (lastPulseElRef.current) {
      lastPulseElRef.current.classList.remove('beat-pulse', 'beat-sustained')
      lastPulseElRef.current = null
    }

    // `activeGroupIdxInBatch` stays the same across every beat of a glued
    // run, so this keeps resolving to the same shared card — the effect
    // still fires each beat (keyed off `currentIdx`), so it still re-blinks.
    const el = itemRefs.current[activeGroupIdxInBatch]
    if (el) {
      lastPulseElRef.current = el
      el.classList.remove('beat-pulse')
      void el.offsetWidth
      el.classList.add('beat-pulse')
      el.classList.add('beat-sustained')

      // The bar spans the whole glued run — from its first beat, not
      // whichever beat is currently pulsing — so it drains once across all
      // of a group's beats instead of resetting full on each one.
      const activeGroup = batchGroups[activeGroupIdxInBatch]
      const startTime = activeGroup ? timeline[activeGroup[0]]?.time : timeline[currentIdx]?.time
      if (startTime !== undefined) restartChordProgress(el, startTime, activeChordEndTime, currentTimeRef.current)
    }
    onPulseRef.current?.(timeline[currentIdx]?.chord ?? '')
  }, [currentIdx, activeGroupIdxInBatch, batchGroups, timeline, activeChordEndTime])

  return (
    <div className="chord-row-wrapper">
      <div className="chord-strip-inner">
        <div className="chord-row" style={{ ['--chord-row-gap' as string]: `${BASE_CHORD_ROW_GAP * chordZoom}px` }}>
          {showCountIn && (
            <CountInDots entries={countInEntries!} currentTime={currentTime} firstChordTime={timeline[0]?.time ?? 0} chordSize={CHORD_SIZE} />
          )}
          {/* Invisible mirror of the next-chord preview — see the ghost
              below the real preview for why this keeps the earlier chord
              cards from shifting left when the preview appears. */}
          {showNextPreview && isLastInBatch && nextChord && (
            <div className="chord-next-preview chord-next-preview-ghost" aria-hidden="true">
              <span className="next-arrow">➤</span>
              <div className="chord-row-item chord-next-preview-item">
                <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE} accentHeight={13.3} nameFontSize={20} />
              </div>
            </div>
          )}
          {batchGroups.map((indices, i) => {
            const anchor = timeline[indices[0]]
            const dots = computeBeatDots(timeline, indices)
            return (
              <div
                key={indices[0]}
                ref={el => { itemRefs.current[i] = el }}
                className={`chord-row-item${i === activeGroupIdxInBatch ? ' chord-row-item-active' : ''}`}
              >
                <ChordDiagram chord={anchor.chord} data={chordDict[anchor.chord] ?? null} size={CHORD_SIZE} accentHeight={13.3} nameFontSize={20} />
                <div className="chord-progress-track">
                  <div className="chord-progress-fill" data-progress-fill />
                  <div className="chord-progress-ticks"><span /><span /><span /><span /></div>
                </div>
                <div className="beat-dots">
                  {dots.map((state, di) => (
                    <span key={di} className={`beat-dot beat-dot-${state}`} />
                  ))}
                </div>
              </div>
            )
          })}
          {showNextPreview && isLastInBatch && nextChord && (
            <div className="chord-next-preview">
              <span className="next-arrow">➤</span>
              <div className="chord-row-item chord-next-preview-item">
                <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE} accentHeight={13.3} nameFontSize={20} />
              </div>
            </div>
          )}
          {/* Invisible mirror of the count-in slot, same width, placed at the
              opposite end of the row — keeps the row's total width (and so
              its centered position) identical whether count-in is showing
              or not, so the chord cards never shift when it disappears.
              Both this and the real one above resolve `inCountInPhase` from
              the same props and vanish together automatically. */}
          {showCountIn && (
            <div className="count-in-ghost" aria-hidden="true">
              <CountInDots entries={countInEntries!} currentTime={currentTime} firstChordTime={timeline[0]?.time ?? 0} chordSize={CHORD_SIZE} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
