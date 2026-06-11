export interface ChordEntry {
  time: number
  chord: string
}

export interface ChordData {
  frets: [number, number, number, number]
}

export interface ChordDictionary {
  [chord: string]: ChordData
}

export type AppState = 'input' | 'creator' | 'playalong'

export interface SyncAnchor {
  barStart: number
  offset: number
}

export interface CreatorSnapshot {
  beats: number[]
  bpm: number
  meter: number
  slots: Record<number, string>
  strumPattern: boolean[]
  audioOffset: number
  syncAnchors: SyncAnchor[]
}
