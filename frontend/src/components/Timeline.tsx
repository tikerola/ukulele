import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChordEntry, Section } from '../types'

interface Props {
  timeline: ChordEntry[]
  duration: number
  currentTime: number
  selectedIdx: number | null
  onSelectChange: (idx: number | null) => void
  onChange: (timeline: ChordEntry[]) => void
  onSeek: (time: number) => void
  locked: boolean
  sections: Section[]
  onSectionsChange: (sections: Section[]) => void
}

const MIN_PPS = 10
const MAX_PPS = 200
const DEFAULT_PPS = 40

const SECTION_PRESETS = ['Intro', 'Verse', 'Chorus', 'Pre-Chorus', 'Instrumental']

const SECTION_COLORS: Record<string, string> = {
  intro: 'rgba(63, 185, 80, 0.45)',
  verse: 'rgba(88, 166, 255, 0.45)',
  chorus: 'rgba(255, 215, 0, 0.45)',
  'pre-chorus': 'rgba(163, 113, 247, 0.45)',
  instrumental: 'rgba(125, 133, 144, 0.45)',
}
const DEFAULT_SECTION_COLOR = 'rgba(240, 136, 62, 0.45)'

function sectionFill(name: string): string {
  return SECTION_COLORS[name.toLowerCase()] ?? DEFAULT_SECTION_COLOR
}

function sectionBorder(name: string): string {
  return sectionFill(name).replace('0.45', '0.9')
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pickTickStep(pps: number): number {
  // keep ticks roughly 60-120px apart
  const steps = [1, 2, 5, 10, 15, 30, 60]
  for (const step of steps) {
    if (step * pps >= 60) return step
  }
  return 60
}

export function Timeline({ timeline, duration, currentTime, selectedIdx, onSelectChange, onChange, onSeek, locked, sections, onSectionsChange }: Props) {
  const [pps, setPps] = useState(DEFAULT_PPS)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  const [rangeSel, setRangeSel] = useState<[number, number] | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number | null>(null)
  const [sectionDrag, setSectionDrag] = useState<{
    idx: number
    startClientX: number
    entryIndices: number[]
    originalTimes: number[]
    originalSection: Section
  } | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrolledSecondRef = useRef(-1)
  const markerRefs = useRef<(HTMLDivElement | null)[]>([])
  const [markerRects, setMarkerRects] = useState<Record<number, { left: number; right: number }>>({})

  const trackWidth = Math.max(duration * pps, 200)

  useEffect(() => {
    if (locked) setSelectedSectionIdx(null)
  }, [locked])

  useLayoutEffect(() => {
    const trackEl = trackRef.current
    if (!trackEl) return
    const trackLeft = trackEl.getBoundingClientRect().left
    const next: Record<number, { left: number; right: number }> = {}
    markerRefs.current.forEach((el, idx) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      next[idx] = { left: r.left - trackLeft, right: r.right - trackLeft }
    })
    setMarkerRects(next)
  }, [timeline, pps])

  // Falls back to the time-based (center) position when a marker for that
  // exact time isn't currently rendered, e.g. a saved section whose boundary
  // chord was since moved or deleted.
  function bandPixelRange(startTime: number, endTime: number): { left: number; width: number } {
    const startIdx = timeline.findIndex(e => e.time === startTime)
    const endIdx = timeline.findIndex(e => e.time === endTime)
    const left = startIdx !== -1 && markerRects[startIdx] ? markerRects[startIdx].left : startTime * pps
    const right = endIdx !== -1 && markerRects[endIdx] ? markerRects[endIdx].right : endTime * pps
    return { left, width: Math.max(2, right - left) }
  }

  const timeFromClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const x = clientX - rect.left
    return Math.min(Math.max(x / pps, 0), duration)
  }, [pps, duration])

  function commitTimeline(next: ChordEntry[]) {
    onChange([...next].sort((a, b) => a.time - b.time))
  }

  function handleTrackClick(e: React.MouseEvent) {
    onSeek(timeFromClientX(e.clientX))
    onSelectChange(null)
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdx(null)
  }

  function deleteSection(idx: number) {
    onSectionsChange(sections.filter((_, si) => si !== idx))
    setSelectedSectionIdx(null)
  }

  // Only counts an entry as belonging to this section if no *other* section's
  // range also covers it — otherwise dragging/duplicating one section could
  // sweep up chords that actually belong to a different, overlapping one.
  function sectionEntryIndices(section: Section): number[] {
    const indices: number[] = []
    timeline.forEach((entry, i) => {
      if (entry.time < section.startTime || entry.time > section.endTime) return
      const claimedByAnother = sections.some(s =>
        s !== section && entry.time >= s.startTime && entry.time <= s.endTime
      )
      if (!claimedByAnother) indices.push(i)
    })
    return indices
  }

  function handleSectionPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation()
    if (locked || e.shiftKey) return
    const section = sections[idx]
    const entryIndices = sectionEntryIndices(section)
    e.currentTarget.setPointerCapture(e.pointerId)
    setSectionDrag({
      idx,
      startClientX: e.clientX,
      entryIndices,
      originalTimes: entryIndices.map(i => timeline[i].time),
      originalSection: section,
    })
    onSelectChange(null)
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdx(idx)
  }

  function handleSectionPointerMove(e: React.PointerEvent) {
    if (!sectionDrag) return
    const { entryIndices, originalTimes, originalSection } = sectionDrag
    let delta = (e.clientX - sectionDrag.startClientX) / pps
    originalTimes.forEach(t => {
      delta = Math.min(delta, duration - t)
      delta = Math.max(delta, -t)
    })
    const next = timeline.map((entry, i) => {
      const pos = entryIndices.indexOf(i)
      return pos === -1 ? entry : { ...entry, time: originalTimes[pos] + delta }
    })
    onChange(next)
    onSectionsChange(sections.map((s, si) => si === sectionDrag.idx
      ? { ...s, startTime: originalSection.startTime + delta, endTime: originalSection.endTime + delta }
      : s))
  }

  function handleSectionPointerUp() {
    if (!sectionDrag) return
    commitTimeline(timeline)
    setSectionDrag(null)
  }

  // Duplicates a section's chords after the end of the whole timeline (not
  // just after itself, which could land the copy on top of whatever section
  // already follows it) and selects the copy so it can be dragged elsewhere.
  function duplicateSection(idx: number) {
    if (locked) return
    const section = sections[idx]
    const entries = sectionEntryIndices(section).map(i => timeline[i])
    if (entries.length === 0) return

    const lastTime = Math.max(...timeline.map(e => e.time))
    const offset = lastTime + 1 - section.startTime
    const newEntries = entries.map(e => ({ ...e, time: Math.min(duration, e.time + offset) }))
    const newSection: Section = {
      name: section.name,
      startTime: Math.min(duration, section.startTime + offset),
      endTime: Math.min(duration, section.endTime + offset),
    }

    commitTimeline([...timeline, ...newEntries])
    const nextSections = [...sections, newSection].sort((a, b) => a.startTime - b.startTime)
    onSectionsChange(nextSections)
    setSelectedSectionIdx(nextSections.indexOf(newSection))
  }

  function handleMarkerPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation()
    if (locked || e.shiftKey) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIdx(idx)
    onSelectChange(idx)
    setAnchorIdx(idx)
    setRangeSel(null)
    setSelectedSectionIdx(null)
  }

  function handleMarkerClick(e: React.MouseEvent, idx: number) {
    e.stopPropagation()
    if (locked) return
    if (!e.shiftKey) return
    const anchor = anchorIdx ?? idx
    const [lo, hi] = anchor <= idx ? [anchor, idx] : [idx, anchor]
    setAnchorIdx(anchor)
    setSelectedSectionIdx(null)
    if (lo === hi) {
      onSelectChange(lo)
      setRangeSel(null)
    } else {
      onSelectChange(null)
      setRangeSel([lo, hi])
    }
  }

  function handleSectionClick(e: React.MouseEvent, idx: number) {
    e.stopPropagation()
    if (locked) return
    onSelectChange(null)
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdx(idx)
  }

  function applySection(name: string) {
    if (!rangeSel) return
    const [lo, hi] = rangeSel
    const startTime = timeline[lo].time
    const endTime = timeline[hi].time
    const next = sections.filter(s => !(s.startTime === startTime && s.endTime === endTime))
    onSectionsChange([...next, { name, startTime, endTime }].sort((a, b) => a.startTime - b.startTime))
    setRangeSel(null)
    setSectionName('')
  }

  function handleMarkerPointerMove(e: React.PointerEvent) {
    if (dragIdx === null) return
    const t = timeFromClientX(e.clientX)
    const next = timeline.map((entry, i) => i === dragIdx ? { ...entry, time: t } : entry)
    onChange(next)
  }

  function handleMarkerPointerUp() {
    if (dragIdx === null) return
    const draggedEntry = timeline[dragIdx]
    const sorted = [...timeline].sort((a, b) => a.time - b.time)
    onChange(sorted)
    onSelectChange(sorted.indexOf(draggedEntry))
    setDragIdx(null)
  }

  function deleteEntry(idx: number) {
    commitTimeline(timeline.filter((_, i) => i !== idx))
    onSelectChange(null)
  }

  function deleteRange(range: [number, number]) {
    const [lo, hi] = range
    commitTimeline(timeline.filter((_, i) => i < lo || i > hi))
    setRangeSel(null)
    setAnchorIdx(null)
    setSectionName('')
  }

  function handleClearAll() {
    if (locked || timeline.length === 0) return
    const count = timeline.length
    const ok = window.confirm(`Clear all ${count} chord${count === 1 ? '' : 's'} from the timeline? This can't be undone.`)
    if (!ok) return
    onChange([])
    onSelectChange(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (locked) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setRangeSel(null)
        setAnchorIdx(null)
        setSelectedSectionIdx(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSectionIdx !== null) {
        deleteSection(selectedSectionIdx)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && rangeSel !== null) {
        deleteRange(rangeSel)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
        deleteEntry(selectedIdx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, timeline, locked, selectedSectionIdx, sections, rangeSel])

  const currentSecond = Math.floor(currentTime)
  useEffect(() => {
    if (currentSecond === lastScrolledSecondRef.current) return
    lastScrolledSecondRef.current = currentSecond
    const container = scrollRef.current
    if (!container) return
    const playheadX = currentTime * pps
    const { scrollLeft, clientWidth } = container
    if (playheadX < scrollLeft + 60 || playheadX > scrollLeft + clientWidth - 60) {
      container.scrollTo({ left: Math.max(0, playheadX - clientWidth / 2), behavior: 'smooth' })
    }
  }, [currentSecond, currentTime, pps])

  const tickStep = pickTickStep(pps)
  const ticks = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= duration; t += tickStep) result.push(t)
    return result
  }, [duration, tickStep])

  return (
    <div className="timeline-wrapper">
      <div className="timeline-toolbar">
        <span className="timeline-label">Timeline <span className="chord-count">({timeline.length})</span></span>
        <div className="timeline-toolbar-actions">
          <div className="timeline-zoom">
            <button className="btn-small" onClick={() => setPps(v => Math.max(MIN_PPS, v - 10))} title="Zoom out">−</button>
            <button className="btn-small" onClick={() => setPps(v => Math.min(MAX_PPS, v + 10))} title="Zoom in">+</button>
          </div>
          <button className="btn-clear" onClick={handleClearAll} disabled={timeline.length === 0 || locked} title={locked ? 'Unlock to clear the timeline' : 'Clear entire timeline'}>
            Clear all
          </button>
        </div>
      </div>
      <div className="timeline-scroll" ref={scrollRef}>
        <div
          className="timeline-track"
          ref={trackRef}
          style={{ width: trackWidth }}
          onClick={handleTrackClick}
          onPointerMove={e => { handleMarkerPointerMove(e); handleSectionPointerMove(e) }}
          onPointerUp={() => { handleMarkerPointerUp(); handleSectionPointerUp() }}
        >
          <div className="timeline-ruler">
            {ticks.map(t => (
              <span key={t} className="timeline-tick" style={{ left: t * pps }}>{formatTime(t)}</span>
            ))}
          </div>

          <div className="timeline-sections">
            {sections.map((s, i) => {
              const { left, width } = bandPixelRange(s.startTime, s.endTime)
              return (
                <div
                  key={i}
                  className={`timeline-section-band${selectedSectionIdx === i ? ' timeline-section-band-selected' : ''}${locked ? ' timeline-section-band-locked' : ''}`}
                  style={{
                    left,
                    width,
                    background: sectionFill(s.name),
                    borderColor: sectionBorder(s.name),
                  }}
                  onClick={e => handleSectionClick(e, i)}
                  onPointerDown={e => handleSectionPointerDown(e, i)}
                  title={`${s.name} (${formatTime(s.startTime)}–${formatTime(s.endTime)})${locked ? '' : ' — drag to move, click to select'}`}
                >
                  <span className="timeline-section-label">{s.name}</span>
                  {!locked && (
                    <button
                      className="timeline-section-delete"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteSection(i) }}
                      title="Remove section"
                    >×</button>
                  )}
                </div>
              )
            })}
            {rangeSel && markerRects[rangeSel[0]] && markerRects[rangeSel[1]] && (
              <div
                className="timeline-section-band timeline-section-band-preview"
                style={{
                  left: markerRects[rangeSel[0]].left,
                  width: Math.max(2, markerRects[rangeSel[1]].right - markerRects[rangeSel[0]].left),
                }}
              />
            )}
          </div>

          <div className="timeline-playhead" style={{ left: currentTime * pps }} />

          {timeline.map((entry, idx) => (
            <div
              key={idx}
              ref={el => { markerRefs.current[idx] = el }}
              className={`timeline-marker${selectedIdx === idx ? ' timeline-marker-selected' : ''}${rangeSel && idx >= rangeSel[0] && idx <= rangeSel[1] ? ' timeline-marker-in-range' : ''}${locked ? ' timeline-marker-locked' : ''}`}
              style={{ left: entry.time * pps }}
              onPointerDown={e => handleMarkerPointerDown(e, idx)}
              onClick={e => handleMarkerClick(e, idx)}
              title={locked ? `${entry.chord} @ ${formatTime(entry.time)}` : `${entry.chord} @ ${formatTime(entry.time)} — drag to move, click to select, shift+click to select a range`}
            >
              {entry.chord}
            </div>
          ))}
        </div>
      </div>

      {rangeSel && timeline[rangeSel[0]] && timeline[rangeSel[1]] && (
        <div className="timeline-popover timeline-section-popover">
          <span className="timeline-popover-hint">
            {rangeSel[1] - rangeSel[0] + 1} chords selected ({formatTime(timeline[rangeSel[0]].time)}–{formatTime(timeline[rangeSel[1]].time)})
          </span>
          <div className="section-preset-buttons">
            {SECTION_PRESETS.map(name => (
              <button key={name} className="btn-small" onClick={() => applySection(name)}>{name}</button>
            ))}
          </div>
          <input
            className="section-name-input"
            placeholder="Custom name…"
            value={sectionName}
            onChange={e => setSectionName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && sectionName.trim()) applySection(sectionName.trim()) }}
          />
          <button className="btn-small" disabled={!sectionName.trim()} onClick={() => applySection(sectionName.trim())}>Add</button>
          <button className="btn-delete" onClick={() => deleteRange(rangeSel)}>× Delete</button>
          <button className="btn-ghost" onClick={() => { setRangeSel(null); setSectionName('') }}>Cancel</button>
        </div>
      )}

      {selectedIdx !== null && timeline[selectedIdx] && (
        <div className="timeline-popover">
          <span className="timeline-popover-chord">{timeline[selectedIdx].chord}</span>
          <span>@ {formatTime(timeline[selectedIdx].time)}</span>
          <span className="timeline-popover-hint">Click a chord below to change it · Esc to deselect</span>
          <button className="btn-delete" onClick={() => deleteEntry(selectedIdx)}>× Delete</button>
        </div>
      )}

      {!locked && selectedSectionIdx !== null && sections[selectedSectionIdx] && (
        <div className="timeline-popover">
          <span className="timeline-popover-chord">{sections[selectedSectionIdx].name}</span>
          <span>{formatTime(sections[selectedSectionIdx].startTime)}–{formatTime(sections[selectedSectionIdx].endTime)}</span>
          <span className="timeline-popover-hint">Drag the band to move it · Esc to deselect</span>
          <button className="btn-small" onClick={() => duplicateSection(selectedSectionIdx)}>⎘ Duplicate</button>
          <button className="btn-delete" onClick={() => deleteSection(selectedSectionIdx)}>× Delete section</button>
        </div>
      )}
    </div>
  )
}
