import type { ChordEntry } from '../types'

export type BeatDotState = 'lit' | 'empty'

// Reads each beat's own stored `beatSlot` (0-3) rather than inferring a
// position from timestamps — there's no reliable way to know "this chord's
// hold-duration is exactly 4 beats" from time alone, since a chord can be
// held for any number of beats before changing. `beatSlot` is set exactly
// once, by Timeline's "fill beats" (the only way to create a multi-beat
// glued run), which already knows precisely which beat each created entry
// represents. The run's anchor (its first entry) is always quarter 0.
//
// Entries saved before `beatSlot` existed fall back to a time-based quarter
// estimate: fill-created beats (unlike old manual glues) were always placed
// at exact fractions of the gap to the next chord, so re-deriving the
// nearest quarter from their timestamp recovers the original skip pattern
// without needing the song re-recorded.
export function computeBeatDots(entries: ChordEntry[], group: number[]): BeatDotState[] {
  const dots: BeatDotState[] = ['empty', 'empty', 'empty', 'empty']
  if (group.length === 0) return dots

  const start = entries[group[0]].time
  const lastIdx = group[group.length - 1]
  const end = lastIdx + 1 < entries.length ? entries[lastIdx + 1].time : null
  const span = end !== null ? end - start : null
  const quarterWidth = span && span > 0 ? span / 4 : null

  group.forEach((idx, i) => {
    let slot: number
    if (i === 0) {
      slot = 0
    } else if (entries[idx].beatSlot !== undefined) {
      slot = entries[idx].beatSlot!
    } else if (quarterWidth) {
      slot = Math.round((entries[idx].time - start) / quarterWidth)
    } else {
      slot = i
    }
    dots[Math.min(3, Math.max(0, slot))] = 'lit'
  })

  return dots
}
