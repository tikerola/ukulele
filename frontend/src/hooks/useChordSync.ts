import { useMemo } from 'react'
import type { ChordEntry } from '../types'

export function useChordSync(timeline: ChordEntry[], currentTime: number) {
  return useMemo(() => {
    if (timeline.length === 0) return { current: null, upcoming: [] }

    let currentIdx = 0
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (currentTime >= timeline[i].time) {
        currentIdx = i
        break
      }
    }

    const current = timeline[currentIdx]
    const upcoming = timeline.slice(currentIdx + 1, currentIdx + 4)

    return { current, upcoming }
  }, [timeline, currentTime])
}
