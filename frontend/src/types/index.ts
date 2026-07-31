export interface ChordEntry {
  time: number
  chord: string
  // Merges this entry's card with the one immediately before it in the
  // sorted timeline, so repeated strums of the same chord blink one shared
  // card instead of showing a separate card per entry. Only takes effect
  // when that predecessor's chord actually matches (checked at render
  // time) — see lib/chordGroups.ts. Only ever set by Timeline's "Fill
  // beats", which is what keeps `beatSlot` meaningful — there's no other
  // way to end up part of a glued run.
  tied?: boolean
  // Which quarter (0-3) of a nominal 4-beat bar this beat occupies within
  // its glued run, set by "Fill beats" from its own beat index — see
  // lib/beatDots.ts. Undefined for the run's anchor (always quarter 0) and
  // for any pre-existing glued entry from before this field existed.
  beatSlot?: number
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
  lyrics?: string
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
