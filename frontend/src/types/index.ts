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

export interface Section {
  name: string
  startTime: number
  endTime: number
}

export interface CreatorSnapshot {
  timeline: ChordEntry[]
  sections?: Section[]
}
