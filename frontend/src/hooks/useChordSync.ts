import { useMemo } from 'react'
import type { ChordEntry, Section } from '../types'

const BATCH_SIZE = 4

export function useChordSync(timeline: ChordEntry[], currentTime: number) {
  return useMemo(() => {
    if (timeline.length === 0) {
      return {
        currentIdx: -1,
        batch: [] as ChordEntry[],
        activeIdxInBatch: -1,
        nextTime: null as number | null,
        isLastInBatch: false,
        nextChord: null as string | null,
      }
    }

    let currentIdx = 0
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (currentTime >= timeline[i].time) {
        currentIdx = i
        break
      }
    }

    // Chords are grouped into fixed batches of 4; the active chord progresses
    // across a batch's slots and only the batch itself swaps out once playback
    // moves past the last slot.
    const batchStart = Math.floor(currentIdx / BATCH_SIZE) * BATCH_SIZE
    const batch = timeline.slice(batchStart, batchStart + BATCH_SIZE)
    const activeIdxInBatch = currentIdx - batchStart
    const nextEntry = currentIdx + 1 < timeline.length ? timeline[currentIdx + 1] : null
    const isLastInBatch = activeIdxInBatch === batch.length - 1

    return {
      currentIdx,
      batch,
      activeIdxInBatch,
      nextTime: nextEntry?.time ?? null,
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

    for (const s of sorted) {
      const w = sectionWindow(s, timeline)
      if (currentTime >= s.startTime && currentTime < w.activeUntil) {
        section = s
        window = w
        break
      }
    }

    // Before the first chord of the earliest section, playback still sits in
    // the run-up to it (e.g. video start before an "Intro" section's first
    // chord). Rather than falling back to the plain view for that stretch,
    // treat it as already belonging to the section it leads into.
    if (!section && sorted.length > 0 && currentTime < sorted[0].startTime) {
      section = sorted[0]
      window = sectionWindow(section, timeline)
    }

    if (!section || !window) {
      return {
        section: null as Section | null,
        entries: [] as ChordEntry[],
        activeIdx: -1,
        nextSection: null as Section | null,
        nextChord: null as string | null,
      }
    }

    const { entries, nextEntry } = window
    let activeIdx = -1
    for (let i = entries.length - 1; i >= 0; i--) {
      if (currentTime >= entries[i].time) { activeIdx = i; break }
    }

    const sectionIdx = sorted.indexOf(section)

    return {
      section,
      entries,
      activeIdx,
      nextSection: sorted[sectionIdx + 1] ?? null,
      nextChord: nextEntry?.chord ?? null,
    }
  }, [timeline, sections, currentTime])
}
