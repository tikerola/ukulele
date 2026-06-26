import { useLayoutEffect, useRef, useMemo } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { BeatIndicator } from './BeatIndicator'
import { useChordSync } from '../hooks/useChordSync'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  chords: string[]
  timeline: ChordEntry[]
  currentTime: number
  chordDict: ChordDictionary
  bpm?: number
  beatsPerBar?: number
  strumPattern?: boolean[]
  onPulse?: (chord: string) => void
  beatPhaseTime?: number
}

const CHORD_SIZE = 1.3

export function ChordOverlay({ chords, timeline, currentTime, chordDict, bpm = 0, beatsPerBar = 4, onPulse, beatPhaseTime }: Props) {
  const phaseTime = beatPhaseTime ?? timeline[0]?.time ?? 0
  const { current } = useChordSync(timeline, currentTime)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastEntryRef = useRef(-1)
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse
  const chordsRef = useRef(chords)
  chordsRef.current = chords

  const entryTimes = useMemo(() => timeline.map(e => e.time), [timeline])

  useLayoutEffect(() => {
    let latest = -1
    for (const t of entryTimes) {
      if (t <= currentTime) latest = t
      else break
    }
    if (latest !== -1 && latest !== lastEntryRef.current) {
      lastEntryRef.current = latest

      if (lastPulseElRef.current) {
        lastPulseElRef.current.classList.remove('beat-pulse', 'beat-sustained')
        lastPulseElRef.current = null
      }

      if (current) {
        const idx = chordsRef.current.indexOf(current.chord)
        const el = idx >= 0 ? itemRefs.current[idx] : null
        if (el) {
          lastPulseElRef.current = el
          el.classList.remove('beat-pulse')
          void el.offsetWidth
          el.classList.add('beat-pulse')
          el.classList.add('beat-sustained')
        }
        onPulseRef.current?.(current.chord)
      }
    }
  }, [entryTimes, currentTime, current])

  const activeChord = current?.chord ?? null

  return (
    <div className="chord-row-wrapper">
      <div className="chord-row">
        {chords.map((chord, i) => (
          <div
            key={chord}
            ref={el => { itemRefs.current[i] = el }}
            className={`chord-row-item${chord === activeChord ? ' chord-row-item-active' : ''}`}
          >
            <ChordDiagram chord={chord} data={chordDict[chord] ?? null} size={CHORD_SIZE} />
          </div>
        ))}
      </div>
      <BeatIndicator
        currentTime={currentTime}
        bpm={bpm}
        phaseTime={phaseTime}
        beatsPerBar={beatsPerBar}
        chordEventTimes={entryTimes}
      />
    </div>
  )
}
