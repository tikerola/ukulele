import { useLayoutEffect, useRef, useMemo } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { BeatIndicator } from './BeatIndicator'
import { useChordSync } from '../hooks/useChordSync'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  bpm?: number
  beatsPerBar?: number
  strumPattern?: boolean[]
  showPreview?: boolean
  onPulse?: (chord: string) => void
  beatPhaseTime?: number
}

const SIDE_SIZES = [1.1, 0.76, 0.52] as const
const SIDE_FONT_SIZES = [18, 14, 11] as const

export function ChordOverlay({ timeline, currentTime, chordDict, bpm = 0, beatsPerBar = 4, onPulse, beatPhaseTime }: Props) {
  const phaseTime = beatPhaseTime ?? timeline[0]?.time ?? 0
  const { current, past, upcoming } = useChordSync(timeline, currentTime)
  const pulseRef = useRef<HTMLDivElement>(null)
  const lastEntryRef = useRef(-1)
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse

  const entryTimes = useMemo(() => timeline.map(e => e.time), [timeline])

  useLayoutEffect(() => {
    let latest = -1
    for (const t of entryTimes) {
      if (t <= currentTime) latest = t
      else break
    }
    if (latest !== -1 && latest !== lastEntryRef.current) {
      lastEntryRef.current = latest
      const el = pulseRef.current
      if (el) {
        el.classList.remove('beat-pulse')
        void el.offsetWidth
        el.classList.add('beat-pulse')
        el.classList.add('beat-sustained')
      }
      if (current) onPulseRef.current?.(current.chord)
    }
  }, [entryTimes, currentTime, current])

  function renderSide(entry: ChordEntry | null, dist: 1 | 2 | 3) {
    const size = SIDE_SIZES[dist - 1]
    const fontSize = SIDE_FONT_SIZES[dist - 1]
    return (
      <div key={entry ? entry.time : `empty-${dist}`} className={`carousel-item carousel-dist-${dist}`}>
        {entry ? (
          <>
            <div className="carousel-chord-name" style={{ fontSize }}>{entry.chord}</div>
            <ChordDiagram chord={entry.chord} data={chordDict[entry.chord] ?? null} size={size} />
          </>
        ) : (
          <div className="carousel-chord-name carousel-chord-empty" style={{ fontSize }}>—</div>
        )}
      </div>
    )
  }

  return (
    <div className="chord-carousel">
      {renderSide(past[2] ?? null, 3)}
      {renderSide(past[1] ?? null, 2)}
      {renderSide(past[0] ?? null, 1)}

      <div className={`carousel-item carousel-center chord-current${current ? ' chord-current-active' : ''}`} ref={pulseRef}>
        {current ? (
          <>
            <div className="chord-current-name">{current.chord}</div>
            <ChordDiagram chord={current.chord} data={chordDict[current.chord] ?? null} size={1.8} />
          </>
        ) : (
          <div className="chord-current-name">—</div>
        )}
        <BeatIndicator
          currentTime={currentTime}
          bpm={bpm}
          phaseTime={phaseTime}
          beatsPerBar={beatsPerBar}
          chordEventTimes={entryTimes}
        />
      </div>

      {renderSide(upcoming[0] ?? null, 1)}
      {renderSide(upcoming[1] ?? null, 2)}
      {renderSide(upcoming[2] ?? null, 3)}
    </div>
  )
}
