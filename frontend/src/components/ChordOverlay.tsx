import { useLayoutEffect, useRef } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { useChordSync } from '../hooks/useChordSync'
import { restartChordProgress } from '../lib/chordProgress'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
}

const CHORD_SIZE = 1.3

export function ChordOverlay({ timeline, currentTime, chordDict, onPulse }: Props) {
  const { currentIdx, batchGroups, activeGroupIdxInBatch, activeChordEndTime, isLastInBatch, nextChord } = useChordSync(timeline, currentTime)
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
        <div className="chord-row">
          {batchGroups.map((indices, i) => {
            const anchor = timeline[indices[0]]
            return (
              <div
                key={indices[0]}
                ref={el => { itemRefs.current[i] = el }}
                className={`chord-row-item${i === activeGroupIdxInBatch ? ' chord-row-item-active' : ''}`}
              >
                <ChordDiagram chord={anchor.chord} data={chordDict[anchor.chord] ?? null} size={CHORD_SIZE} accentHeight={13.3} />
                <div className="chord-progress-track">
                  <div className="chord-progress-fill" data-progress-fill />
                  <div className="chord-progress-ticks"><span /><span /><span /><span /></div>
                </div>
              </div>
            )
          })}
        </div>
        {isLastInBatch && nextChord && (
          <div className="chord-next-preview">
            <span className="next-arrow">➤</span>
            <div className="chord-row-item chord-next-preview-item">
              <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE} accentHeight={13.3} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
