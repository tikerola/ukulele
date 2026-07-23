import { useLayoutEffect, useRef } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { useChordSync } from '../hooks/useChordSync'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
}

const CHORD_SIZE = 1.3

export function ChordOverlay({ timeline, currentTime, chordDict, onPulse }: Props) {
  const { currentIdx, batch, activeIdxInBatch, isLastInBatch, nextChord } = useChordSync(timeline, currentTime)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastIdxRef = useRef(-1)
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse

  useLayoutEffect(() => {
    if (currentIdx === -1 || currentIdx === lastIdxRef.current) return
    lastIdxRef.current = currentIdx

    if (lastPulseElRef.current) {
      lastPulseElRef.current.classList.remove('beat-pulse', 'beat-sustained')
      lastPulseElRef.current = null
    }

    const el = itemRefs.current[activeIdxInBatch]
    if (el) {
      lastPulseElRef.current = el
      el.classList.remove('beat-pulse')
      void el.offsetWidth
      el.classList.add('beat-pulse')
      el.classList.add('beat-sustained')
    }
    onPulseRef.current?.(batch[activeIdxInBatch]?.chord ?? '')
  }, [currentIdx, activeIdxInBatch, batch])

  return (
    <div className="chord-row-wrapper">
      <div className="chord-strip-inner">
        <div className="chord-row">
          {batch.map((entry, i) => (
            <div
              key={i}
              ref={el => { itemRefs.current[i] = el }}
              className={`chord-row-item${i === activeIdxInBatch ? ' chord-row-item-active' : ''}`}
            >
              <ChordDiagram chord={entry.chord} data={chordDict[entry.chord] ?? null} size={CHORD_SIZE} />
            </div>
          ))}
        </div>
        {isLastInBatch && nextChord && (
          <div className="chord-next-preview">
            <span className="next-arrow">➤</span>
            <div className="chord-row-item chord-next-preview-item">
              <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE * 0.8} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
