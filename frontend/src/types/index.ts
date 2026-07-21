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

export interface CreatorSnapshot {
  timeline: ChordEntry[]
}
