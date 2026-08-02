import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildChordGroups } from '../lib/chordGroups'
import { computeBeatDots } from '../lib/beatDots'
import { COUNT_IN_CHORD } from '../lib/countIn'
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
  lyricsBySection?: Map<Section, string>
  onSectionsChange: (sections: Section[]) => void
  onBeginEdit: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  startOffset?: number
  endOffset?: number
  onStartOffsetChange: (time: number | undefined) => void
  onEndOffsetChange: (time: number | undefined) => void
}

const MIN_PPS = 10
const MAX_PPS = 200
const DEFAULT_PPS = 40
const FILL_BEATS_STORAGE_KEY = 'ukesync-fill-beats'

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

// Shared by the per-chord and per-section fill popovers so the beats-count
// input and per-beat on/off chips (and their behavior) can't drift apart.
// Defined at module scope (not nested in Timeline) so it keeps a stable
// component identity across renders — nested inside, a fresh function value
// on every render would make React treat it as a new component type each
// time and remount the control (and its input, losing focus/edits) on every
// keystroke.
function FillBeatsChips({ fillBeats, fillSkip, onFillBeatsChange, onToggleBeat }: {
  fillBeats: number
  fillSkip: Set<number>
  onFillBeatsChange: (value: number) => void
  onToggleBeat: (i: number) => void
}) {
  return (
    <>
      <input
        type="number"
        min={2}
        max={16}
        value={fillBeats}
        onChange={e => onFillBeatsChange(Math.max(2, Math.min(16, parseInt(e.target.value) || 2)))}
        className="fill-beats-input"
        title="How many equal beats to divide each gap into"
      />
      <div className="fill-beats-chips">
        {Array.from({ length: fillBeats }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`fill-beat-chip${i === 0 || !fillSkip.has(i) ? ' fill-beat-chip-on' : ''}`}
            disabled={i === 0}
            onClick={() => onToggleBeat(i)}
            title={i === 0 ? `Beat 1 — this tap` : `Beat ${i + 1}${fillSkip.has(i) ? ' — off' : ' — on'}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </>
  )
}

export function Timeline({ timeline, duration, currentTime, selectedIdx, onSelectChange, onChange, onSeek, locked, sections, lyricsBySection, onSectionsChange, onBeginEdit, canUndo, canRedo, onUndo, onRedo, startOffset, endOffset, onStartOffsetChange, onEndOffsetChange }: Props) {
  const [pps, setPps] = useState(DEFAULT_PPS)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  // Captured at the start of a marker drag: which section(s) currently treat
  // this exact chord's time as their startTime and/or endTime (a section
  // with only one chord binds both edges to it) — so dragging a boundary
  // chord carries its section's edge along instead of silently leaving the
  // section behind at the chord's old position.
  const [markerBoundSections, setMarkerBoundSections] = useState<{ si: number; edge: 'start' | 'end' }[]>([])
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  // One or more contiguous ranges — a plain shift+click selection is always
  // a single range, but "Select free chords" can produce several disjoint
  // ones (e.g. a gap before the first section and another after the last).
  const [rangeSel, setRangeSel] = useState<[number, number][] | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [selectedSectionIdxs, setSelectedSectionIdxs] = useState<number[]>([])
  const [sectionDrag, setSectionDrag] = useState<{
    idx: number
    startClientX: number
    entryIndices: number[]
    originalTimes: number[]
    originalSection: Section
  } | null>(null)
  const [trimDrag, setTrimDrag] = useState<'start' | 'end' | null>(null)
  // Remembered across sessions (not just within one) — once you've settled
  // on e.g. "8 beats, skip the offbeats" for how you tap in a song, that's
  // almost always still what you want the next time you open Creator.
  const [fillBeats, setFillBeats] = useState<number>(() => {
    const saved = parseInt(window.localStorage.getItem(FILL_BEATS_STORAGE_KEY) ?? '', 10)
    return Number.isFinite(saved) ? Math.max(2, Math.min(16, saved)) : 4
  })
  const [fillSkip, setFillSkip] = useState<Set<number>>(new Set())

  useEffect(() => {
    try { window.localStorage.setItem(FILL_BEATS_STORAGE_KEY, String(fillBeats)) } catch { /* storage unavailable */ }
  }, [fillBeats])

  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const markerRefs = useRef<(HTMLDivElement | null)[]>([])
  const [markerRects, setMarkerRects] = useState<Record<number, { left: number; right: number }>>({})

  const trackWidth = Math.max(duration * pps, 200)

  useEffect(() => {
    if (locked) setSelectedSectionIdxs([])
  }, [locked])

  // A fresh selection starts with every beat enabled — skip choices from
  // filling a previous entry shouldn't silently carry over to this one.
  useEffect(() => {
    setFillSkip(new Set())
  }, [selectedIdx])

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
    setSelectedSectionIdxs([])
  }

  function deleteSections(idxs: number[]) {
    onBeginEdit()
    const idxSet = new Set(idxs)
    onSectionsChange(sections.filter((_, si) => !idxSet.has(si)))
    setSelectedSectionIdxs([])
  }

  function deleteSection(idx: number) {
    deleteSections([idx])
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
    onBeginEdit()
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
    setSelectedSectionIdxs([idx])
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

  // The trailing rhythm of a run of entries: the time of its last distinct
  // chord change (first beat), and the gap between that and the one before
  // it. Tied/glued fill beats (see fillToNextChord) are collapsed out of
  // both — a filled-in bar's held beats must not shrink the measured
  // interval down to a fraction of one, or anchor the result on a beat that
  // isn't the start of a chord. `entries` must be in time order
  // (sectionEntryIndices and the timeline itself already are). Interval
  // falls back to `intervalFallback` when there are fewer than 2 distinct
  // chords, so there's nothing to measure a rhythm from.
  function trailingChordRhythm(entries: ChordEntry[], intervalFallback: number): { lastBeat: number; interval: number } {
    const firstBeats: number[] = []
    entries.forEach((e, i) => {
      const prev = i > 0 ? entries[i - 1] : null
      const isGlued = !!e.tied && !!prev && prev.chord === e.chord
      if (!isGlued) firstBeats.push(e.time)
    })
    const lastBeat = firstBeats[firstBeats.length - 1]
    if (firstBeats.length < 2) return { lastBeat, interval: intervalFallback }
    return { lastBeat, interval: lastBeat - firstBeats[firstBeats.length - 2] }
  }

  // Duplicates one or more sections' chords, then selects the copies so they
  // can still be dragged elsewhere if needed. Anchored to continue the
  // timeline's own trailing rhythm — one chord-change interval after
  // whatever the last real chord currently is — rather than the duplicated
  // section's own rhythm. That matters whenever the section being
  // duplicated isn't itself the last thing in the timeline (e.g. reusing an
  // earlier "A" for a third verse after "A B" have already been tapped):
  // the copy should pick up right after "B", continuing B's rhythm, not
  // land whenever A's own chords would have led next. All selected sections
  // shift by the same offset, anchored off the earliest selected section's
  // startTime, so the gaps between the originals are preserved between the
  // duplicates.
  function duplicateSections(idxs: number[]) {
    if (locked || idxs.length === 0) return
    const selected = [...idxs].map(i => sections[i]).sort((a, b) => a.startTime - b.startTime)
    const earliestStart = selected[0].startTime

    const perSection = selected
      .map(section => ({ section, entries: sectionEntryIndices(section).map(i => timeline[i]) }))
      .filter(x => x.entries.length > 0)
    if (perSection.length === 0) return

    onBeginEdit()
    const last = perSection[perSection.length - 1]
    const timelineChords = timeline.filter(e => e.chord !== COUNT_IN_CHORD)
    const { lastBeat, interval } = trailingChordRhythm(timelineChords, last.section.endTime - last.section.startTime)
    const offset = lastBeat + interval - earliestStart

    const newEntries: ChordEntry[] = []
    const newSections: Section[] = []
    perSection.forEach(({ section, entries }) => {
      entries.forEach(e => newEntries.push({ ...e, time: Math.max(0, Math.min(duration, e.time + offset)) }))
      newSections.push({
        name: section.name,
        startTime: Math.max(0, Math.min(duration, section.startTime + offset)),
        endTime: Math.max(0, Math.min(duration, section.endTime + offset)),
      })
    })

    commitTimeline([...timeline, ...newEntries])
    const nextSections = [...sections, ...newSections].sort((a, b) => a.startTime - b.startTime)
    onSectionsChange(nextSections)
    setSelectedSectionIdxs(newSections.map(ns => nextSections.indexOf(ns)))
  }

  function setStartOffsetAt(t: number | undefined) {
    if (t === undefined) { onStartOffsetChange(undefined); return }
    const max = endOffset ?? duration
    onStartOffsetChange(Math.max(0, Math.min(t, max)))
  }

  function setEndOffsetAt(t: number | undefined) {
    if (t === undefined) { onEndOffsetChange(undefined); return }
    const min = startOffset ?? 0
    onEndOffsetChange(Math.min(duration, Math.max(t, min)))
  }

  function handleTrimPointerDown(e: React.PointerEvent, which: 'start' | 'end') {
    e.stopPropagation()
    if (locked) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setTrimDrag(which)
    onSelectChange(null)
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdxs([])
  }

  function handleTrimPointerMove(e: React.PointerEvent) {
    if (!trimDrag) return
    const t = timeFromClientX(e.clientX)
    if (trimDrag === 'start') setStartOffsetAt(t); else setEndOffsetAt(t)
  }

  function handleTrimPointerUp() {
    if (!trimDrag) return
    setTrimDrag(null)
  }

  function handleMarkerPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation()
    if (locked || e.shiftKey) return
    onBeginEdit()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIdx(idx)
    onSelectChange(idx)
    setAnchorIdx(idx)
    setRangeSel(null)
    setSelectedSectionIdxs([])
    const t = timeline[idx].time
    const bound: { si: number; edge: 'start' | 'end' }[] = []
    sections.forEach((s, si) => {
      if (s.startTime === t) bound.push({ si, edge: 'start' })
      if (s.endTime === t) bound.push({ si, edge: 'end' })
    })
    setMarkerBoundSections(bound)
  }

  function handleMarkerClick(e: React.MouseEvent, idx: number) {
    e.stopPropagation()
    if (locked) return
    if (!e.shiftKey) return
    const anchor = anchorIdx ?? idx
    const [lo, hi] = anchor <= idx ? [anchor, idx] : [idx, anchor]
    setAnchorIdx(anchor)
    setSelectedSectionIdxs([])
    if (lo === hi) {
      onSelectChange(lo)
      setRangeSel(null)
    } else {
      onSelectChange(null)
      setRangeSel([[lo, hi]])
    }
  }

  function handleSectionClick(e: React.MouseEvent, idx: number) {
    e.stopPropagation()
    if (locked) return
    onSelectChange(null)
    setRangeSel(null)
    setAnchorIdx(null)
    if (e.shiftKey) {
      setSelectedSectionIdxs(prev => prev.includes(idx)
        ? prev.filter(i => i !== idx)
        : [...prev, idx].sort((a, b) => a - b))
    } else {
      setSelectedSectionIdxs([idx])
    }
  }

  // One range → one section, same as before. Multiple ranges (from "Select
  // free chords" spanning more than one gap) → one same-named section per
  // range — sections already support repeating names elsewhere (Playalong
  // lyrics matching pairs them up by chronological order per name).
  function applySection(name: string) {
    if (!rangeSel || rangeSel.length === 0) return
    onBeginEdit()
    const newSections = rangeSel.map(([lo, hi]) => ({
      name,
      startTime: timeline[lo].time,
      endTime: timeline[hi].time,
    }))
    const next = sections.filter(s =>
      !newSections.some(ns => ns.startTime === s.startTime && ns.endTime === s.endTime)
    )
    onSectionsChange([...next, ...newSections].sort((a, b) => a.startTime - b.startTime))
    setRangeSel(null)
    setSectionName('')
  }

  function handleMarkerPointerMove(e: React.PointerEvent) {
    if (dragIdx === null) return
    const t = timeFromClientX(e.clientX)
    const next = timeline.map((entry, i) => i === dragIdx ? { ...entry, time: t } : entry)
    onChange(next)
    if (markerBoundSections.length > 0) {
      onSectionsChange(sections.map((s, si) => {
        const edges = markerBoundSections.filter(b => b.si === si)
        return edges.reduce((acc, { edge }) => edge === 'start' ? { ...acc, startTime: t } : { ...acc, endTime: t }, s)
      }))
    }
  }

  function handleMarkerPointerUp() {
    if (dragIdx === null) return
    const draggedEntry = timeline[dragIdx]
    const sorted = [...timeline].sort((a, b) => a.time - b.time)
    onChange(sorted)
    onSelectChange(sorted.indexOf(draggedEntry))
    setDragIdx(null)
    setMarkerBoundSections([])
  }

  // A section's boundaries are just the times of its first/last chord —
  // once either chord is gone the boundary points at nothing, so the
  // section is cleared rather than left silently dangling (it would
  // otherwise still render, falling back to a stale pixel position).
  function sectionsAfterDeleting(deletedTimes: Set<number>): Section[] {
    return sections.filter(s => !deletedTimes.has(s.startTime) && !deletedTimes.has(s.endTime))
  }

  function deleteEntry(idx: number) {
    onBeginEdit()
    const deletedTime = timeline[idx].time
    commitTimeline(timeline.filter((_, i) => i !== idx))
    const nextSections = sectionsAfterDeleting(new Set([deletedTime]))
    if (nextSections.length !== sections.length) onSectionsChange(nextSections)
    onSelectChange(null)
  }

  function toggleFillBeat(i: number) {
    setFillSkip(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  // Divides the gap between two timeline entries into `fillBeats` equal
  // beats and taps the starting chord onto every one of them that isn't
  // skipped — everything after the first is glued (`tied: true`) so it
  // shares one blinking card with the original tap instead of drawing a
  // card each. Each created beat also records its own quarter (0-3, scaled
  // onto a nominal 4-beat bar when fillBeats isn't 4) so the beat-dots
  // always know exactly which position it represents, with no timing math
  // involved.
  function fillBeatsBetween(start: ChordEntry, next: ChordEntry): ChordEntry[] {
    const step = (next.time - start.time) / fillBeats
    const newEntries: ChordEntry[] = []
    for (let b = 1; b < fillBeats; b++) {
      if (fillSkip.has(b)) continue
      const beatSlot = Math.min(3, Math.round((b / fillBeats) * 4))
      newEntries.push({ time: start.time + step * b, chord: start.chord, tied: true, beatSlot })
    }
    return newEntries
  }

  function fillToNextChord(idx: number) {
    if (locked) return
    const start = timeline[idx]
    const next = timeline[idx + 1]
    if (!start || !next || fillBeats < 2) return
    const newEntries = fillBeatsBetween(start, next)
    if (newEntries.length === 0) return
    onBeginEdit()
    commitTimeline([...timeline, ...newEntries])
    setFillSkip(new Set())
  }

  // Same fill, applied in one action to every bare gap between consecutive
  // chords across one or more selected sections — gaps that already have a
  // fill (or any other entry) between their chords are left untouched, so
  // re-running this doesn't stack duplicate beats into an already-filled
  // gap. All new entries are computed against the same starting `timeline`
  // and committed together as a single undo step, rather than calling
  // fillToNextChord repeatedly (which would each read a stale `timeline`
  // prop from before the others' entries were added).
  function fillSectionsBeats(idxs: number[]) {
    if (locked || fillBeats < 2 || idxs.length === 0) return
    const groups = buildChordGroups(timeline)
    const newEntries: ChordEntry[] = []
    idxs.forEach(si => {
      const section = sections[si]
      if (!section) return
      const anchors = sectionEntryIndices(section).filter(i => groups.some(g => g[0] === i))
      for (let k = 0; k < anchors.length - 1; k++) {
        const startIdx = anchors[k]
        const nextIdx = anchors[k + 1]
        if (nextIdx !== startIdx + 1) continue
        newEntries.push(...fillBeatsBetween(timeline[startIdx], timeline[nextIdx]))
      }
    })
    if (newEntries.length === 0) return
    onBeginEdit()
    commitTimeline([...timeline, ...newEntries])
    setFillSkip(new Set())
  }

  // Deletes every entry a fill added after its anchor (the anchor itself
  // keeps its index afterward, since everything removed sits after it) —
  // undoes a fill back down to a single tap.
  function removeFill(group: number[]) {
    if (locked) return
    onBeginEdit()
    const toRemove = new Set(group.slice(1))
    const deletedTimes = new Set(group.slice(1).map(i => timeline[i].time))
    commitTimeline(timeline.filter((_, i) => !toRemove.has(i)))
    const nextSections = sectionsAfterDeleting(deletedTimes)
    if (nextSections.length !== sections.length) onSectionsChange(nextSections)
  }

  function deleteRanges(ranges: [number, number][]) {
    onBeginEdit()
    const toRemove = new Set<number>()
    const deletedTimes = new Set<number>()
    ranges.forEach(([lo, hi]) => {
      for (let i = lo; i <= hi; i++) {
        toRemove.add(i)
        deletedTimes.add(timeline[i].time)
      }
    })
    commitTimeline(timeline.filter((_, i) => !toRemove.has(i)))
    const nextSections = sectionsAfterDeleting(deletedTimes)
    if (nextSections.length !== sections.length) onSectionsChange(nextSections)
    setRangeSel(null)
    setAnchorIdx(null)
    setSectionName('')
  }

  function handleClearAll() {
    if (locked || timeline.length === 0) return
    const count = timeline.length
    const ok = window.confirm(`Clear all ${count} chord${count === 1 ? '' : 's'} and all sections from the timeline?`)
    if (!ok) return
    onBeginEdit()
    onChange([])
    onSectionsChange([])
    onSelectChange(null)
    setSelectedSectionIdxs([])
  }

  function handleUndo() {
    if (locked || !canUndo) return
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdxs([])
    onUndo()
  }

  function handleRedo() {
    if (locked || !canRedo) return
    setRangeSel(null)
    setAnchorIdx(null)
    setSelectedSectionIdxs([])
    onRedo()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (locked) return
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo(); else handleUndo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }
      if (e.key === 'Escape') {
        setRangeSel(null)
        setAnchorIdx(null)
        setSelectedSectionIdxs([])
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSectionIdxs.length > 0) {
        deleteSections(selectedSectionIdxs)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && rangeSel !== null) {
        deleteRanges(rangeSel)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
        deleteEntry(selectedIdx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, timeline, locked, selectedSectionIdxs, sections, rangeSel, canUndo, canRedo])

  // Keeps the playhead centered in the visible area at all times, rather
  // than only snapping the view once the playhead nears an edge — so the
  // track continuously scrolls right under a fixed playhead as playback
  // advances. Runs on every currentTime update (i.e. every animation frame
  // during playback via useYouTubePlayer's tick loop), setting scrollLeft
  // directly rather than an animated scrollTo — the per-frame updates
  // already read as smooth motion, and an animated scroll re-triggered
  // every frame would fight itself and never settle. Only reacts to
  // currentTime/pps/trackWidth changes, so it never fights a manual scroll
  // made while paused (currentTime is static then).
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const playheadX = currentTime * pps
    const maxScrollLeft = Math.max(0, trackWidth - container.clientWidth)
    container.scrollLeft = Math.max(0, Math.min(playheadX - container.clientWidth / 2, maxScrollLeft))
  }, [currentTime, pps, trackWidth])

  const tickStep = pickTickStep(pps)
  const ticks = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= duration; t += tickStep) result.push(t)
    return result
  }, [duration, tickStep])

  // Runs of 2+ glued entries — one persistent chain badge per run, drawn
  // under its markers regardless of how close together they are (unlike a
  // connecting line, which has nowhere to go once adjacent pills touch).
  const glueGroups = useMemo(() => buildChordGroups(timeline).filter(g => g.length > 1), [timeline])

  // The selected entry already has a glued run following it (from a fill or
  // a manual multi-glue) — offer removing that run instead of filling again.
  const selectedFillGroup = selectedIdx !== null ? glueGroups.find(g => g[0] === selectedIdx) : undefined

  // Contiguous runs of chords not covered by any section — e.g. a leading
  // intro before the first tagged section, or a gap left between two of
  // them. Feeds "Select free chords", so the user can grab everything
  // that's left and tag it in one go instead of hunting for it by hand.
  const freeRanges = useMemo(() => {
    const ranges: [number, number][] = []
    let start: number | null = null
    timeline.forEach((entry, i) => {
      // Count-in beats aren't chords and can't usefully belong to a song
      // section — Playalong strips them out of the timeline it hands to
      // useSectionChords, so a section that ends up covering only count-in
      // beats would have zero real entries in it and, worse, never end
      // (see useChordSync's sectionWindow), silently breaking every
      // section after it. Treat them the same as "already claimed" so they
      // can never end up inside a free range.
      const isFree = entry.chord !== COUNT_IN_CHORD
        && !sections.some(s => entry.time >= s.startTime && entry.time <= s.endTime)
      if (isFree) {
        if (start === null) start = i
      } else if (start !== null) {
        ranges.push([start, i - 1])
        start = null
      }
    })
    if (start !== null) ranges.push([start, timeline.length - 1])
    return ranges
  }, [timeline, sections])

  function selectFreeChords() {
    if (locked || freeRanges.length === 0) return
    onSelectChange(null)
    setSelectedSectionIdxs([])
    setAnchorIdx(null)
    setRangeSel(freeRanges)
  }

  return (
    <div className="timeline-wrapper">
      <div className="timeline-toolbar">
        <span className="timeline-label">Timeline <span className="chord-count">({timeline.length})</span></span>
        <div className="timeline-toolbar-actions">
          <div className="timeline-zoom">
            <button className="btn-small" onClick={handleUndo} disabled={locked || !canUndo} title={locked ? 'Unlock to undo' : 'Undo (Ctrl+Z)'}>↶ Undo</button>
            <button className="btn-small" onClick={handleRedo} disabled={locked || !canRedo} title={locked ? 'Unlock to redo' : 'Redo (Ctrl+Shift+Z)'}>↷ Redo</button>
          </div>
          <div className="timeline-zoom">
            <button className="btn-small" onClick={() => setPps(v => Math.max(MIN_PPS, v - 10))} title="Zoom out">−</button>
            <button className="btn-small" onClick={() => setPps(v => Math.min(MAX_PPS, v + 10))} title="Zoom in">+</button>
          </div>
          <div className="timeline-zoom">
            <button
              className={`btn-small${startOffset != null ? ' btn-small-active' : ''}`}
              onClick={() => setStartOffsetAt(currentTime)}
              disabled={locked}
              title="Set the playback start point to the current position — skips any intro before it in Playalong"
            >
              ⏭ Start{startOffset != null ? ` ${formatTime(startOffset)}` : ''}
            </button>
            {startOffset != null && (
              <button className="btn-small" onClick={() => setStartOffsetAt(undefined)} disabled={locked} title="Clear start offset">×</button>
            )}
            <button
              className={`btn-small${endOffset != null ? ' btn-small-active' : ''}`}
              onClick={() => setEndOffsetAt(currentTime)}
              disabled={locked}
              title="Set the playback end point to the current position — skips any outro after it in Playalong"
            >
              ⏹ End{endOffset != null ? ` ${formatTime(endOffset)}` : ''}
            </button>
            {endOffset != null && (
              <button className="btn-small" onClick={() => setEndOffsetAt(undefined)} disabled={locked} title="Clear end offset">×</button>
            )}
          </div>
          <button
            className="btn-small"
            onClick={selectFreeChords}
            disabled={locked || freeRanges.length === 0}
            title={locked ? 'Unlock to select' : 'Select every chord not yet assigned to a song section'}
          >
            ⬚ Select free chords
          </button>
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
          onPointerMove={e => { handleMarkerPointerMove(e); handleSectionPointerMove(e); handleTrimPointerMove(e) }}
          onPointerUp={() => { handleMarkerPointerUp(); handleSectionPointerUp(); handleTrimPointerUp() }}
        >
          <div className="timeline-ruler">
            {ticks.map(t => (
              <span key={t} className="timeline-tick" style={{ left: t * pps }}>{formatTime(t)}</span>
            ))}
          </div>

          <div className="timeline-sections">
            {sections.map((s, i) => {
              const { left, width } = bandPixelRange(s.startTime, s.endTime)
              const hasLyrics = !!lyricsBySection?.has(s)
              return (
                <div
                  key={i}
                  className={`timeline-section-band${selectedSectionIdxs.includes(i) ? ' timeline-section-band-selected' : ''}${locked ? ' timeline-section-band-locked' : ''}`}
                  style={{
                    left,
                    width,
                    background: sectionFill(s.name),
                    borderColor: sectionBorder(s.name),
                  }}
                  onClick={e => handleSectionClick(e, i)}
                  onPointerDown={e => handleSectionPointerDown(e, i)}
                  title={`${s.name} (${formatTime(s.startTime)}–${formatTime(s.endTime)})${hasLyrics ? ' — has lyrics' : ''}${locked ? '' : ' — drag to move, click to select, shift+click to select multiple'}`}
                >
                  <span className="timeline-section-label">{s.name}</span>
                  {hasLyrics && <span className="timeline-section-lyrics-icon" title="Lyrics added for this section">♪</span>}
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
            {rangeSel?.map(([lo, hi], ri) => markerRects[lo] && markerRects[hi] && (
              <div
                key={`range-preview-${ri}`}
                className="timeline-section-band timeline-section-band-preview"
                style={{
                  left: markerRects[lo].left,
                  width: Math.max(2, markerRects[hi].right - markerRects[lo].left),
                }}
              />
            ))}
          </div>

          <div className="timeline-playhead" style={{ left: currentTime * pps }} />

          {!!startOffset && (
            <div className="timeline-trim-overlay timeline-trim-overlay-start" style={{ left: 0, width: startOffset * pps }} />
          )}
          {endOffset != null && (
            <div
              className="timeline-trim-overlay timeline-trim-overlay-end"
              style={{ left: endOffset * pps, width: Math.max(0, trackWidth - endOffset * pps) }}
            />
          )}
          {!!startOffset && (
            <div
              className={`timeline-trim-handle timeline-trim-handle-start${locked ? ' timeline-trim-handle-locked' : ''}`}
              style={{ left: startOffset * pps }}
              onPointerDown={e => handleTrimPointerDown(e, 'start')}
              title={`Song starts at ${formatTime(startOffset)}${locked ? '' : ' — drag to adjust'}`}
            />
          )}
          {endOffset != null && (
            <div
              className={`timeline-trim-handle timeline-trim-handle-end${locked ? ' timeline-trim-handle-locked' : ''}`}
              style={{ left: endOffset * pps }}
              onPointerDown={e => handleTrimPointerDown(e, 'end')}
              title={`Song ends at ${formatTime(endOffset)}${locked ? '' : ' — drag to adjust'}`}
            />
          )}

          {glueGroups.map(indices => {
            const first = markerRects[indices[0]]
            const last = markerRects[indices[indices.length - 1]]
            const left = first ? first.left : timeline[indices[0]].time * pps
            const right = last ? last.right : timeline[indices[indices.length - 1]].time * pps
            const center = (left + right) / 2
            const label = timeline[indices[0]].chord === COUNT_IN_CHORD ? 'Count-in' : timeline[indices[0]].chord
            // Same dot data the beat-dots row inside the card uses — shown
            // here as beat numbers (1-4) instead of dots, so the tooltip
            // itself says which beats are actually included, e.g. "1,3,4"
            // makes it obvious beat 2 was skipped rather than just "× 3".
            const beatNumbers = computeBeatDots(timeline, indices)
              .map((state, i) => (state === 'lit' ? i + 1 : null))
              .filter((n): n is number => n !== null)
              .join(',')
            return (
              <div key={`glue-${indices[0]}`}>
                <div
                  className={`timeline-glue-line${locked ? ' timeline-glue-line-locked' : ''}`}
                  style={{ left, width: Math.max(2, right - left) }}
                />
                <div
                  className={`timeline-glue-badge${locked ? ' timeline-glue-badge-locked' : ''}`}
                  style={{ left: center }}
                  onClick={e => { e.stopPropagation(); removeFill(indices) }}
                  title={locked
                    ? `${label} ${beatNumbers} — glued into one card`
                    : `${label} ${beatNumbers} — glued into one card, click to remove the fill`}
                >
                  🔗
                </div>
              </div>
            )
          })}

          {timeline.map((entry, idx) => {
            const isCountIn = entry.chord === COUNT_IN_CHORD
            const label = isCountIn ? 'Count-in' : entry.chord
            return (
              <div
                key={idx}
                ref={el => { markerRefs.current[idx] = el }}
                className={`timeline-marker${isCountIn ? ' timeline-marker-count-in' : ''}${selectedIdx === idx ? ' timeline-marker-selected' : ''}${rangeSel?.some(([lo, hi]) => idx >= lo && idx <= hi) ? ' timeline-marker-in-range' : ''}${locked ? ' timeline-marker-locked' : ''}`}
                style={{ left: entry.time * pps }}
                onPointerDown={e => handleMarkerPointerDown(e, idx)}
                onClick={e => handleMarkerClick(e, idx)}
                title={locked ? `${label} @ ${formatTime(entry.time)}` : `${label} @ ${formatTime(entry.time)} — drag to move, click to select, shift+click to select a range`}
              >
                {isCountIn ? '⏱' : entry.chord}
              </div>
            )
          })}
        </div>
      </div>

      <div className={`timeline-popover${rangeSel ? ' timeline-section-popover' : ''}`}>
        {rangeSel && rangeSel.length > 0 && rangeSel.every(([lo, hi]) => timeline[lo] && timeline[hi]) ? (
          <>
            <span className="timeline-popover-hint">
              {rangeSel.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0)} chord{rangeSel.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0) === 1 ? '' : 's'} selected
              {rangeSel.length === 1
                ? ` (${formatTime(timeline[rangeSel[0][0]].time)}–${formatTime(timeline[rangeSel[0][1]].time)})`
                : ` across ${rangeSel.length} gaps`}
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
            <button className="btn-delete" onClick={() => deleteRanges(rangeSel)}>× Delete</button>
            <button className="btn-ghost" onClick={() => { setRangeSel(null); setSectionName('') }}>Cancel</button>
          </>
        ) : selectedIdx !== null && timeline[selectedIdx] ? (
          <>
            <span className="timeline-popover-chord">{timeline[selectedIdx].chord === COUNT_IN_CHORD ? 'Count-in' : timeline[selectedIdx].chord}</span>
            <span>@ {formatTime(timeline[selectedIdx].time)}</span>
            <span className="timeline-popover-hint">Click a chord below to change it · Esc to deselect</span>
            {selectedFillGroup ? (
              <>
                <span className="popover-divider" />
                <button
                  className="btn-delete"
                  onClick={() => removeFill(selectedFillGroup)}
                  title="Delete the auto-filled beats and go back to a single tap"
                >
                  🗑 Remove fill ({selectedFillGroup.length - 1})
                </button>
              </>
            ) : selectedIdx < timeline.length - 1 && (
              <>
                <span className="popover-divider" />
                <div className="fill-beats-control">
                  <span className="timeline-popover-hint">
                    Fill to {timeline[selectedIdx + 1].chord === COUNT_IN_CHORD ? 'Count-in' : timeline[selectedIdx + 1].chord} @ {formatTime(timeline[selectedIdx + 1].time)} ·
                  </span>
                  <FillBeatsChips fillBeats={fillBeats} fillSkip={fillSkip} onFillBeatsChange={setFillBeats} onToggleBeat={toggleFillBeat} />
                  <button className="btn-glue" onClick={() => fillToNextChord(selectedIdx)} title="Tap this chord onto every enabled beat up to the next chord">
                    ⚡ Fill beats
                  </button>
                </div>
              </>
            )}
            <button className="btn-delete" onClick={() => deleteEntry(selectedIdx)}>× Delete</button>
          </>
        ) : !locked && selectedSectionIdxs.length === 1 && sections[selectedSectionIdxs[0]] ? (
          <>
            <span className="timeline-popover-chord">{sections[selectedSectionIdxs[0]].name}</span>
            <span>{formatTime(sections[selectedSectionIdxs[0]].startTime)}–{formatTime(sections[selectedSectionIdxs[0]].endTime)}</span>
            <span className="timeline-popover-hint">Drag the band to move it · Shift+click another section to multi-select · Esc to deselect</span>
            <button
              className="btn-small"
              onClick={() => duplicateSections(selectedSectionIdxs)}
              title="Duplicate, placed one chord-change interval after the last chord — continuing this section's own rhythm instead of appending at the very end"
            >⎘ Duplicate</button>
            <span className="popover-divider" />
            <div className="fill-beats-control">
              <span className="timeline-popover-hint">Fill every bare gap in this section ·</span>
              <FillBeatsChips fillBeats={fillBeats} fillSkip={fillSkip} onFillBeatsChange={setFillBeats} onToggleBeat={toggleFillBeat} />
              <button
                className="btn-glue"
                onClick={() => fillSectionsBeats(selectedSectionIdxs)}
                title="Apply this beat fill to every gap between consecutive chords in this section that isn't already filled"
              >
                ⚡ Fill section
              </button>
            </div>
            <button className="btn-delete" onClick={() => deleteSections(selectedSectionIdxs)}>× Delete section</button>
          </>
        ) : !locked && selectedSectionIdxs.length > 1 ? (
          <>
            <span className="timeline-popover-chord">{selectedSectionIdxs.length} sections selected</span>
            <span className="timeline-popover-hint">Shift+click a section to add/remove it · Esc to deselect</span>
            <button
              className="btn-small"
              onClick={() => duplicateSections(selectedSectionIdxs)}
              title="Duplicate, placed one chord-change interval after the last chord — continuing this section's own rhythm instead of appending at the very end"
            >⎘ Duplicate</button>
            <span className="popover-divider" />
            <div className="fill-beats-control">
              <span className="timeline-popover-hint">Fill every bare gap in these sections ·</span>
              <FillBeatsChips fillBeats={fillBeats} fillSkip={fillSkip} onFillBeatsChange={setFillBeats} onToggleBeat={toggleFillBeat} />
              <button
                className="btn-glue"
                onClick={() => fillSectionsBeats(selectedSectionIdxs)}
                title="Apply this beat fill to every gap between consecutive chords in these sections that isn't already filled"
              >
                ⚡ Fill sections
              </button>
            </div>
            <button className="btn-delete" onClick={() => deleteSections(selectedSectionIdxs)}>× Delete sections</button>
          </>
        ) : (
          <span className="timeline-popover-hint">Select a chord or section below to edit it</span>
        )}
      </div>
    </div>
  )
}
