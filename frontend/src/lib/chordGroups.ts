import type { ChordEntry } from '../types'

// Collapses consecutive entries into shared display groups wherever an
// entry is marked `tied` AND its immediate predecessor has the same chord.
// Validity is re-derived from the current array on every call rather than
// stored, so dragging, deleting, undo/redo, or reassigning a chord never
// needs separate cleanup — a glue that no longer makes sense just stops
// applying on the next render.
export function buildChordGroups(entries: ChordEntry[]): number[][] {
  const groups: number[][] = []
  entries.forEach((entry, i) => {
    const prev = i > 0 ? entries[i - 1] : null
    const isGlued = !!entry.tied && !!prev && prev.chord === entry.chord
    if (isGlued && groups.length > 0) {
      groups[groups.length - 1].push(i)
    } else {
      groups.push([i])
    }
  })
  return groups
}
