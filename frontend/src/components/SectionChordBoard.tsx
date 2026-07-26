import { useLayoutEffect, useRef, useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { restartChordProgress } from '../lib/chordProgress'
import type { ChordEntry, ChordDictionary, Section } from '../types'

interface Props {
  section: Section
  entries: ChordEntry[]
  activeIdx: number
  nextSection: Section | null
  nextChord: string | null
  activeChordEndTime: number | null
  currentTime: number
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
}

const CHORD_SIZE = 1.2

// Splits `total` items into the fewest rows that fit `maxPerRow`, sized as
// evenly as possible with any remainder going to the earlier rows — so a
// section reads as balanced lines instead of a greedily-packed row followed
// by a nearly-empty one.
function distributeRows(total: number, maxPerRow: number): number[] {
  if (total === 0 || maxPerRow <= 0) return []
  const rowCount = Math.ceil(total / maxPerRow)
  const base = Math.floor(total / rowCount)
  const remainder = total % rowCount
  return Array.from({ length: rowCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function SectionChordBoard({ section, entries, activeIdx, nextSection, nextChord, activeChordEndTime, currentTime, chordDict, onPulse }: Props) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastKeyRef = useRef<string>('')
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  const gridRef = useRef<HTMLDivElement | null>(null)
  const [rows, setRows] = useState<number[]>(entries.length ? [entries.length] : [])

  // Measures the actual rendered chord width and container width to work out
  // how many chords fit per row, then regroups into balanced rows. Runs
  // before paint so the initial single-row fallback (used to get something
  // measurable on the DOM) never flashes.
  useLayoutEffect(() => {
    const container = gridRef.current
    const first = itemRefs.current[0]
    if (!container || !first) {
      setRows(entries.length ? [entries.length] : [])
      return
    }

    function recompute() {
      const itemWidth = first!.getBoundingClientRect().width
      if (itemWidth === 0) return
      const styles = getComputedStyle(container!)
      const gap = parseFloat(styles.getPropertyValue('--chord-gap')) || 0
      const maxPerRow = Math.max(1, Math.floor((container!.clientWidth + gap) / (itemWidth + gap)))
      setRows(distributeRows(entries.length, maxPerRow))
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [entries.length])

  // `rows` can briefly disagree with `entries.length` right after a section
  // change (state hasn't caught up yet) — fall back to one row rather than
  // render a mismatched slice.
  const safeRows = rows.reduce((a, b) => a + b, 0) === entries.length
    ? rows
    : (entries.length ? [entries.length] : [])

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

      const startTime = entries[activeIdx]?.time
      if (startTime !== undefined) restartChordProgress(el, startTime, activeChordEndTime, currentTimeRef.current)
    }
    onPulseRef.current?.(entries[activeIdx]?.chord ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey, activeIdx, activeChordEndTime])

  let cursor = 0
  const rowGroups = safeRows.map(count => {
    const start = cursor
    cursor += count
    return entries.slice(start, start + count).map((entry, offset) => {
      const i = start + offset
      return (
        <div
          key={i}
          ref={el => { itemRefs.current[i] = el }}
          className={`chord-row-item${i === activeIdx ? ' chord-row-item-active' : ''}`}
        >
          <ChordDiagram chord={entry.chord} data={chordDict[entry.chord] ?? null} size={CHORD_SIZE} />
          <div className="chord-progress-track">
            <div className="chord-progress-fill" data-progress-fill />
            <div className="chord-progress-ticks"><span /><span /><span /><span /></div>
          </div>
        </div>
      )
    })
  })

  return (
    <div className="section-board">
      <div className="section-board-header">
        <span className="section-board-name">{section.name}</span>
        {nextSection && <span className="section-board-next">Next: {nextSection.name}</span>}
      </div>
      <div className="section-chord-grid" ref={gridRef}>
        {rowGroups.map((group, r) => (
          <div className="section-chord-line" key={r}>{group}</div>
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
