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
  // How many beats this chord's card should display as spanning — drives
  // the number of beat-dots and progress-bar tick marks drawn for it (see
  // lib/beatDots.ts). Only meaningful on a group's anchor (its first
  // entry); undefined means the default of 4. Lets a chord that's actually
  // held for e.g. 2 beats read as "counts to 2" instead of always
  // displaying against a nominal 4-beat bar.
  beats?: number
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
  // Sections sharing the same (non-empty) tieGroup value are shown stacked
  // together in Playalong — whichever one currentTime falls into renders at
  // normal size, the others as smaller preview rows above/below it. The
  // string itself doubles as the group's display name (editable from the
  // Creator's multi-select popover), the same way a Section's own `name`
  // is just a plain label rather than an id.
  tieGroup?: string
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
  // Off by default — a tie group's active row already competes for space
  // with its smaller preview rows, so lyrics stay hidden there until the
  // user opts in via Playalong's header toggle. Doesn't affect an untied
  // section's own lyrics, which always show when present.
  showTiedLyrics?: boolean
  // Per-song fingering tweaks (currently just string mutes) layered on top
  // of the global chord dictionary — e.g. this song's G# should skip its G
  // string. Keyed by chord name; only chords with an actual edit are
  // present. Scoped to this song rather than the dictionary itself, so
  // customizing one song's G# doesn't change every other song's G#.
  chordOverrides?: ChordDictionary
}

export interface SavedSong {
  video_id: string
  title: string | null
  chords: string[]
  updated_at: string
}
