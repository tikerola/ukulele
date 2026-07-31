import { useMemo } from 'react'
import { buildChordGroups } from '../lib/chordGroups'
import type { ChordEntry, Section } from '../types'

const BATCH_SIZE = 4

export function useChordSync(timeline: ChordEntry[], currentTime: number) {
  return useMemo(() => {
    if (timeline.length === 0) {
      return {
        currentIdx: -1,
        batchGroups: [] as number[][],
        activeGroupIdxInBatch: -1,
        activeChordEndTime: null as number | null,
        isLastInBatch: false,
        nextChord: null as string | null,
      }
    }

    // -1 means playback hasn't reached the first chord's time yet — distinct
    // from index 0, which would wrongly mark the first chord as already
    // active (and, in RecordingView, pulse its sound) before its turn.
    let currentIdx = -1
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (currentTime >= timeline[i].time) {
        currentIdx = i
        break
      }
    }

    // Batches are measured in *chord groups*, not raw entries — a glued run
    // of repeats counts as a single slot, same as it renders as a single
    // card. Batching by raw entry count instead would let one glued run
    // fill an entire batch by itself, hiding the other upcoming chords that
    // are supposed to share the row with it.
    const groups = buildChordGroups(timeline)
    const currentGroupIdx = currentIdx === -1 ? -1 : groups.findIndex(g => g.includes(currentIdx))
    const batchGroupStart = currentGroupIdx === -1 ? 0 : Math.floor(currentGroupIdx / BATCH_SIZE) * BATCH_SIZE
    const batchGroups = groups.slice(batchGroupStart, batchGroupStart + BATCH_SIZE)
    const activeGroupIdxInBatch = currentGroupIdx === -1 ? -1 : currentGroupIdx - batchGroupStart

    // The chord's progress bar should drain across its *whole* glued run,
    // not reset every beat within it — so this is the time of the next
    // *different* chord (the first entry of the following group), not the
    // next raw beat. null once there's nothing left in the timeline.
    const currentGroup = currentGroupIdx === -1 ? null : groups[currentGroupIdx]
    const groupLastIdx = currentGroup ? currentGroup[currentGroup.length - 1] : -1
    const activeChordEndTime = currentGroup && groupLastIdx + 1 < timeline.length
      ? timeline[groupLastIdx + 1].time
      : null

    const nextEntry = currentIdx + 1 < timeline.length ? timeline[currentIdx + 1] : null

    // True for every beat of the last group in the batch — a glued run is
    // one card, so its preview should appear as soon as that card becomes
    // active, the same as it would for an unglued last chord (which only
    // ever has one beat to begin with) — not wait for its final beat.
    const lastGroupInBatch = batchGroups[batchGroups.length - 1]
    const isLastInBatch = !!lastGroupInBatch && lastGroupInBatch.includes(currentIdx)

    return {
      currentIdx,
      batchGroups,
      activeGroupIdxInBatch,
      activeChordEndTime,
      isLastInBatch,
      nextChord: nextEntry?.chord ?? null,
    }
  }, [timeline, currentTime])
}

// A section's stored endTime is the *start* of its last chord, not the
// moment that chord finishes playing — so "is currentTime in this section"
// can't use endTime directly, or the section (and its last-chord preview)
// would vanish the instant the last chord begins. Its true active window
// runs through to whichever timeline entry comes next, named or not.
function sectionWindow(section: Section, timeline: ChordEntry[]) {
  const entries = timeline.filter(e => e.time >= section.startTime && e.time <= section.endTime)
  const lastEntry = entries[entries.length - 1]
  const lastIdxInTimeline = lastEntry ? timeline.indexOf(lastEntry) : -1
  const nextEntry = lastIdxInTimeline !== -1 && lastIdxInTimeline + 1 < timeline.length
    ? timeline[lastIdxInTimeline + 1]
    : null
  return { entries, nextEntry, activeUntil: nextEntry ? nextEntry.time : Infinity }
}

// Resolves which named section (if any) covers the current playback time, and
// the slice of the timeline that falls inside it — used to show a whole
// section's chords at once instead of scrolling a fixed-size batch.
export function useSectionChords(timeline: ChordEntry[], sections: Section[], currentTime: number) {
  return useMemo(() => {
    const sorted = [...sections].sort((a, b) => a.startTime - b.startTime)

    let section: Section | null = null
    let window: ReturnType<typeof sectionWindow> | null = null

    // A section with no real chord entries inside it (e.g. one accidentally
    // tagged over count-in beats, which are stripped out of `timeline`
    // before it ever reaches this hook) has no `nextEntry` to bound it, so
    // `activeUntil` falls back to Infinity — skipping it here is what keeps
    // that from permanently "swallowing" every section after it the moment
    // playback reaches its startTime.
    for (const s of sorted) {
      const w = sectionWindow(s, timeline)
      if (w.entries.length === 0) continue
      if (currentTime >= s.startTime && currentTime < w.activeUntil) {
        section = s
        window = w
        break
      }
    }

    // Before the first chord of the earliest (non-empty) section, playback
    // still sits in the run-up to it (e.g. video start before an "Intro"
    // section's first chord). Rather than falling back to the plain view
    // for that stretch, treat it as already belonging to the section it
    // leads into.
    const firstNonEmpty = sorted.find(s => sectionWindow(s, timeline).entries.length > 0)
    if (!section && firstNonEmpty && currentTime < firstNonEmpty.startTime) {
      section = firstNonEmpty
      window = sectionWindow(section, timeline)
    }

    if (!section || !window) {
      return {
        section: null as Section | null,
        entries: [] as ChordEntry[],
        activeIdx: -1,
        nextSection: null as Section | null,
        nextChord: null as string | null,
        activeChordEndTime: null as number | null,
        isLastChordActive: false,
      }
    }

    const { entries, nextEntry } = window
    let activeIdx = -1
    for (let i = entries.length - 1; i >= 0; i--) {
      if (currentTime >= entries[i].time) { activeIdx = i; break }
    }

    const sectionIdx = sorted.indexOf(section)

    // The progress bar should drain across the *whole* glued run rather than
    // resetting every beat within it, so this resolves to the time of the
    // next *different* chord — the group's own last beat's window extends
    // into the section's next entry (or the section boundary, for the
    // section's final group), just as a single ungrouped chord's would.
    const groups = buildChordGroups(entries)
    const activeGroup = activeIdx === -1 ? null : groups.find(g => g.includes(activeIdx)) ?? null
    const groupLastIdx = activeGroup ? activeGroup[activeGroup.length - 1] : -1
    const activeChordEndTime = !activeGroup
      ? null
      : groupLastIdx + 1 < entries.length
        ? entries[groupLastIdx + 1].time
        : (window.activeUntil === Infinity ? null : window.activeUntil)

    // True for every beat of the section's last group — a glued run is one
    // card, so the next-section preview should appear as soon as that card
    // becomes active, the same as it would for an unglued last chord (which
    // only ever has one beat to begin with) — not wait for its final beat.
    const isLastChordActive = !!activeGroup && activeGroup === groups[groups.length - 1]

    return {
      section,
      entries,
      activeIdx,
      nextSection: sorted[sectionIdx + 1] ?? null,
      nextChord: nextEntry?.chord ?? null,
      activeChordEndTime,
      isLastChordActive,
    }
  }, [timeline, sections, currentTime])
}
