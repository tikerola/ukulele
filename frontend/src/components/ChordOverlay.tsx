import { useEffect, useRef, useMemo } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { BeatIndicator } from './BeatIndicator'
import { useChordSync } from '../hooks/useChordSync'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  bpm?: number
}

export function ChordOverlay({ timeline, currentTime, chordDict, bpm = 0 }: Props) {
  const phaseTime = timeline[0]?.time ?? 0
  const { current, upcoming } = useChordSync(timeline, currentTime)
  const pulseRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(-1)

  const tapTimes = useMemo(() => timeline.map(e => e.time), [timeline])

  useEffect(() => {
    // Find the most recent tap that has passed
    let lastTap = -1
    for (const t of tapTimes) {
      if (t <= currentTime) lastTap = t
      else break
    }

    if (lastTap !== -1 && lastTap !== lastTapRef.current) {
      lastTapRef.current = lastTap
      const el = pulseRef.current
      if (el) {
        el.classList.remove('beat-pulse')
        void el.offsetWidth
        el.classList.add('beat-pulse')
      }
    }
  }, [tapTimes, currentTime])

  return (
    <div className="chord-overlay">
      <div className="chord-current" ref={pulseRef}>
        {current ? (
          <>
            <div className="chord-current-name">{current.chord}</div>
            <ChordDiagram
              chord={current.chord}
              data={chordDict[current.chord] ?? null}
              size={1.8}
            />
          </>
        ) : (
          <div className="chord-current-name">—</div>
        )}
        <BeatIndicator currentTime={currentTime} bpm={bpm} phaseTime={phaseTime} />
      </div>

      <div className="chord-upcoming">
        <div className="chord-upcoming-label">Next</div>
        <div className="chord-upcoming-list">
          {upcoming.map((entry, i) => (
            <div key={i} className="chord-upcoming-item">
              <span className="upcoming-chord-name">{entry.chord}</span>
              <ChordDiagram
                chord={entry.chord}
                data={chordDict[entry.chord] ?? null}
                size={0.9}
              />
            </div>
          ))}
          {upcoming.length === 0 && (
            <span className="chord-upcoming-empty">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
