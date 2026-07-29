export interface ChordEntry {
  time: number
  chord: string
  // Merges this entry's card with the one immediately before it in the
  // sorted timeline, so repeated strums of the same chord blink one shared
  // card instead of showing a separate card per entry. Only takes effect
  // when that predecessor's chord actually matches (checked at render
  // time) — see lib/chordGroups.ts.
  tied?: boolean
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
  reference?: string
  startOffset?: number
  endOffset?: number
  locked?: boolean
  showNextChordPreview?: boolean
}

export interface SavedSong {
  video_id: string
  title: string | null
  chords: string[]
  updated_at: string
}
