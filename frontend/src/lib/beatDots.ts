import type { ChordEntry } from '../types'

export type BeatDotState = 'lit' | 'empty'

// Reads each beat's own stored `beatSlot` rather than inferring a position
// from timestamps — there's no reliable way to know "this chord's
// hold-duration is exactly N beats" from time alone, since a chord can be
// held for any number of beats before changing. `beatSlot` is set exactly
// once, by Timeline's "fill beats" (the only way to create a multi-beat
// glued run), which already knows precisely which beat each created entry
// represents. The run's anchor (its first entry) is always beat 0.
//
// The number of dots itself comes from the anchor's `beats` field (see
// types/index.ts), defaulting to 4 — so a chord explicitly marked as a
// 2-beat chord renders a 2-dot row instead of always assuming a 4-beat bar.
//
// Entries saved before `beatSlot` existed fall back to a time-based beat
// estimate: fill-created beats (unlike old manual glues) were always placed
// at exact fractions of the gap to the next chord, so re-deriving the
// nearest beat from their timestamp recovers the original skip pattern
// without needing the song re-recorded.
export function computeBeatDots(entries: ChordEntry[], group: number[]): BeatDotState[] {
  if (group.length === 0) return ['empty', 'empty', 'empty', 'empty']

  const beats = Math.max(1, entries[group[0]].beats ?? 4)
  const dots: BeatDotState[] = Array.from({ length: beats }, () => 'empty')

  const start = entries[group[0]].time
  const lastIdx = group[group.length - 1]
  const end = lastIdx + 1 < entries.length ? entries[lastIdx + 1].time : null
  const span = end !== null ? end - start : null
  const beatWidth = span && span > 0 ? span / beats : null

  group.forEach((idx, i) => {
    let slot: number
    if (i === 0) {
      slot = 0
    } else if (entries[idx].beatSlot !== undefined) {
      slot = entries[idx].beatSlot!
    } else if (beatWidth) {
      slot = Math.round((entries[idx].time - start) / beatWidth)
    } else {
      slot = i
    }
    dots[Math.min(beats - 1, Math.max(0, slot))] = 'lit'
  })

  return dots
}
