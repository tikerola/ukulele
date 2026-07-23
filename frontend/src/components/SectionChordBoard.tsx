import { useLayoutEffect, useRef } from 'react'
import { ChordDiagram } from './ChordDiagram'
import type { ChordEntry, ChordDictionary, Section } from '../types'

interface Props {
  section: Section
  entries: ChordEntry[]
  activeIdx: number
  nextSection: Section | null
  nextChord: string | null
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
}

const CHORD_SIZE = 1.2

export function SectionChordBoard({ section, entries, activeIdx, nextSection, nextChord, chordDict, onPulse }: Props) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastKeyRef = useRef<string>('')
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse

  const pulseKey = `${section.name}:${section.startTime}:${activeIdx}`

  useLayoutEffect(() => {
    if (activeIdx === -1 || pulseKey === lastKeyRef.current) return
    lastKeyRef.current = pulseKey

    if (lastPulseElRef.current) {
      lastPulseElRef.current.classList.remove('beat-pulse', 'beat-sustained')
      lastPulseElRef.current = null
    }

    const el = itemRefs.current[activeIdx]
    if (el) {
      lastPulseElRef.current = el
      el.classList.remove('beat-pulse')
      void el.offsetWidth
      el.classList.add('beat-pulse')
      el.classList.add('beat-sustained')
    }
    onPulseRef.current?.(entries[activeIdx]?.chord ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey, activeIdx])

  return (
    <div className="section-board">
      <div className="section-board-header">
        <span className="section-board-name">{section.name}</span>
        {nextSection && <span className="section-board-next">Next: {nextSection.name}</span>}
      </div>
      <div className="section-chord-grid">
        {entries.map((entry, i) => (
          <div
            key={i}
            ref={el => { itemRefs.current[i] = el }}
            className={`chord-row-item${i === activeIdx ? ' chord-row-item-active' : ''}`}
          >
            <ChordDiagram chord={entry.chord} data={chordDict[entry.chord] ?? null} size={CHORD_SIZE} />
          </div>
        ))}
        {activeIdx === entries.length - 1 && nextChord && (
          <div className="section-chord-next">
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
