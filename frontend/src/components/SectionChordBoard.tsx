import { useLayoutEffect, useRef, useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { CountInDots } from './CountInDots'
import { LyricsCarousel } from './LyricsCarousel'
import { restartChordProgress } from '../lib/chordProgress'
import { buildChordGroups } from '../lib/chordGroups'
import { computeBeatDots } from '../lib/beatDots'
import type { ChordEntry, ChordDictionary, Section } from '../types'

interface Props {
  section: Section
  entries: ChordEntry[]
  activeIdx: number
  nextChord: string | null
  activeChordEndTime: number | null
  currentTime: number
  chordDict: ChordDictionary
  onPulse?: (chord: string) => void
  showNextPreview?: boolean
  isLastChordActive: boolean
  countInEntries?: ChordEntry[]
  isFirstSection?: boolean
  lyrics?: string
  nextLyrics?: string
  hasLyrics?: boolean
  maxLyricsLines?: number
  chordZoom?: number
  lyricsZoom?: number
  // Default beats-per-measure for chords with no `beats` of their own — see
  // CreatorSnapshot.beatsPerMeasure in types/index.ts. Defaults to 4.
  beatsPerMeasure?: number
}

export const BASE_CHORD_SIZE = 1.68
const BASE_CHORD_GAP = 20
// A section that wraps onto multiple rows shows only the row containing the
// active chord at full (defined) size — every other row shrinks to this
// fraction of it. Advancing to the next row swaps which one is full-size,
// so a row that just lost activeness settles at exactly the size the next
// row was already sitting at, rather than snapping to some other value.
const INACTIVE_ROW_SCALE = 0.72

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

export function SectionChordBoard({ section, entries, activeIdx, nextChord, activeChordEndTime, currentTime, chordDict, onPulse, showNextPreview = true, isLastChordActive, countInEntries, isFirstSection, lyrics, nextLyrics, hasLyrics, maxLyricsLines, chordZoom = 1, lyricsZoom = 1, beatsPerMeasure = 4 }: Props) {
  const CHORD_SIZE = BASE_CHORD_SIZE * chordZoom
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const lastPulseElRef = useRef<HTMLDivElement | null>(null)
  const lastKeyRef = useRef<string>('')
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // One entry per rendered card — a run of `tied` same-chord entries
  // collapses into a single group, which then shares one DOM node (and one
  // repeatedly-restarted pulse/progress bar) across all of its entries.
  const displayGroups = buildChordGroups(entries)

  const gridRef = useRef<HTMLDivElement | null>(null)
  const [rows, setRows] = useState<number[]>(displayGroups.length ? [displayGroups.length] : [])

  // Measures the actual rendered chord width and container width to work out
  // how many chords fit per row, then regroups into balanced rows. Runs
  // before paint so the initial single-row fallback (used to get something
  // measurable on the DOM) never flashes.
  useLayoutEffect(() => {
    const container = gridRef.current
    const first = itemRefs.current[displayGroups[0]?.[0] ?? -1]
    if (!container || !first) {
      setRows(displayGroups.length ? [displayGroups.length] : [])
      return
    }

    function recompute() {
      const itemWidth = first!.getBoundingClientRect().width
      if (itemWidth === 0) return
      const styles = getComputedStyle(container!)
      const gap = parseFloat(styles.getPropertyValue('--chord-gap')) || 0
      const maxPerRow = Math.max(1, Math.floor((container!.clientWidth + gap) / (itemWidth + gap)))
      setRows(distributeRows(displayGroups.length, maxPerRow))
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener('resize', recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayGroups.length])

  // `rows` can briefly disagree with `displayGroups.length` right after a
  // section change (state hasn't caught up yet) — fall back to one row
  // rather than render a mismatched slice.
  const safeRows = rows.reduce((a, b) => a + b, 0) === displayGroups.length
    ? rows
    : (displayGroups.length ? [displayGroups.length] : [])

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

      // The bar spans the whole glued run — from its first beat, not
      // whichever beat is currently pulsing — so it drains once across all
      // of a group's beats instead of resetting full on each one.
      const activeGroup = displayGroups.find(g => g.includes(activeIdx))
      const startTime = activeGroup ? entries[activeGroup[0]]?.time : entries[activeIdx]?.time
      if (startTime !== undefined) restartChordProgress(el, startTime, activeChordEndTime, currentTimeRef.current)
    }
    onPulseRef.current?.(entries[activeIdx]?.chord ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey, activeIdx, activeChordEndTime])

  let cursor = 0
  const rowChordSizes: number[] = []
  const rowGroups = safeRows.map((count, r) => {
    const start = cursor
    cursor += count
    const rowIndices = displayGroups.slice(start, start + count)
    const isActiveRow = rowIndices.some(indices => indices.includes(activeIdx))
    // Before the section's first chord goes active (activeIdx === -1, e.g.
    // still in count-in), there's no "current" row yet to key off of —
    // default to the top row instead of shrinking every row.
    const rowChordSize = isActiveRow || (activeIdx === -1 && r === 0) ? CHORD_SIZE : CHORD_SIZE * INACTIVE_ROW_SCALE
    rowChordSizes.push(rowChordSize)
    return rowIndices.map(indices => {
      const anchor = entries[indices[0]]
      const dots = computeBeatDots(entries, indices, beatsPerMeasure)
      return (
        <div
          key={indices[0]}
          ref={el => { indices.forEach(i => { itemRefs.current[i] = el }) }}
          className={`chord-row-item${indices.includes(activeIdx) ? ' chord-row-item-active' : ''}`}
        >
          <ChordDiagram chord={anchor.chord} data={chordDict[anchor.chord] ?? null} size={rowChordSize} accentHeight={13.3} nameFontSize={20} />
          <div className="chord-progress-track">
            <div className="chord-progress-fill" data-progress-fill />
            <div className="chord-progress-ticks">{dots.map((_, di) => <span key={di} />)}</div>
          </div>
          <div className="beat-dots">
            {dots.map((state, di) => (
              <span key={di} className={`beat-dot beat-dot-${state}`} />
            ))}
          </div>
        </div>
      )
    })
  })

  // Mirrors the condition LyricsCarousel uses to render actual content (as
  // opposed to nothing) — the note glyph only makes sense on the header row
  // when there's a lyrics line (current or upcoming preview) to go with it.
  const showLyricsOrnament = hasLyrics && (!!lyrics || !!nextLyrics)

  return (
    <div className="section-board">
      {showLyricsOrnament && (
        <div className="section-board-header">
          <span className="section-board-ornament">♪</span>
        </div>
      )}
      {hasLyrics && (
        <LyricsCarousel
          lyrics={lyrics}
          nextLyrics={nextLyrics}
          showPreview={showNextPreview}
          isLastChordActive={isLastChordActive}
          zoom={lyricsZoom}
          maxLines={maxLyricsLines}
        />
      )}
      <div className="section-chord-grid" ref={gridRef} style={{ ['--chord-gap' as string]: `${BASE_CHORD_GAP * chordZoom}px` }}>
        {rowGroups.map((group, r) => (
          <div className="section-chord-line" key={r}>
            {r === 0 && isFirstSection && !!countInEntries?.length && (
              <CountInDots entries={countInEntries} currentTime={currentTime} firstChordTime={entries[0]?.time ?? 0} chordSize={rowChordSizes[0] ?? CHORD_SIZE} />
            )}
            {/* Invisible mirror of the next-chord preview, placed at the
                opposite end of this row — same reasoning as .count-in-ghost:
                keeps the row's total width (and so its centered position)
                identical whether the preview is showing, so the earlier
                chord cards don't shift left when it appears. */}
            {r === rowGroups.length - 1 && showNextPreview && isLastChordActive && nextChord && (
              <div className="section-chord-next section-chord-next-ghost" aria-hidden="true">
                <span className="next-arrow">➤</span>
                <div className="chord-row-item chord-next-preview-item">
                  <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE} accentHeight={13.3} nameFontSize={20} />
                </div>
              </div>
            )}
            {group}
            {r === rowGroups.length - 1 && showNextPreview && isLastChordActive && nextChord && (
              <div className="section-chord-next">
                <span className="next-arrow">➤</span>
                <div className="chord-row-item chord-next-preview-item">
                  <ChordDiagram chord={nextChord} data={chordDict[nextChord] ?? null} size={CHORD_SIZE} accentHeight={13.3} nameFontSize={20} />
                </div>
              </div>
            )}
            {/* Invisible mirror of the count-in slot — see ChordOverlay.tsx
                for why this keeps the chord cards from shifting when the
                real count-in disappears. */}
            {r === 0 && isFirstSection && !!countInEntries?.length && (
              <div className="count-in-ghost" aria-hidden="true">
                <CountInDots entries={countInEntries} currentTime={currentTime} firstChordTime={entries[0]?.time ?? 0} chordSize={rowChordSizes[0] ?? CHORD_SIZE} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
