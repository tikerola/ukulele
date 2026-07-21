import { useMemo } from 'react'
import type { ChordEntry } from '../types'

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
