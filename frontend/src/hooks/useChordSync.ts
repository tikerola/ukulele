import { useMemo } from 'react'
import type { ChordEntry } from '../types'

export function useChordSync(timeline: ChordEntry[], currentTime: number) {
  return useMemo(() => {
    if (timeline.length === 0) return { current: null, past: [], upcoming: [] }

    let currentIdx = 0
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (currentTime >= timeline[i].time) {
        currentIdx = i
        break
      }
    }

    const current = timeline[currentIdx]

    // Past: up to 3 distinct chord changes before current (most recent first)
    const past: ChordEntry[] = []
    let prev = current.chord
    for (let i = currentIdx - 1; i >= 0 && past.length < 3; i--) {
      if (timeline[i].chord !== prev) {
        past.push(timeline[i])
        prev = timeline[i].chord
      }
    }

    // Upcoming: up to 3 distinct chord changes after current
    const upcoming: ChordEntry[] = []
    prev = current.chord
    for (let i = currentIdx + 1; i < timeline.length && upcoming.length < 3; i++) {
      if (timeline[i].chord !== prev) {
        upcoming.push(timeline[i])
        prev = timeline[i].chord
      }
    }

    return { current, past, upcoming }
  }, [timeline, currentTime])
}
