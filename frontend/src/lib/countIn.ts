// Sentinel `ChordEntry.chord` value marking a manually-tapped count-in beat
// rather than a real chord — never present in any chordDict, so lookups
// naturally no-op instead of needing special-casing everywhere.
export const COUNT_IN_CHORD = '__count-in__'
