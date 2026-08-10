import { CHORD_TOKEN_RE, IGNORE_TOKEN_RE, isChordLine, tokenize } from './parseReference'

// Chord names are always rewritten using sharps — the chord dictionary
// (backend/data/chords.json) has uneven flat-spelled coverage for 7th/maj7
// variants (e.g. no "Gb7", but "F#7" exists), so sharps land in the
// dictionary more often. Ties (the plain triads/minors) have both spellings
// anyway. A transposed chord that still isn't in the dictionary falls back
// to no diagram, same as any other unrecognized chord name already does.
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

function transposeNote(note: string, semitones: number): string {
  const idx = NOTE_TO_SEMITONE[note]
  if (idx === undefined) return note
  return SHARP_NAMES[((idx + semitones) % 12 + 12) % 12]
}

// Rewrites a single chord token's root (and, for a slash chord, its bass
// note) by `semitones` — e.g. transposeChord('F#m7/A#', 2) -> 'G#m7/C'.
// The quality suffix in between is left exactly as written, since it isn't
// pitch information: the dictionary and reference text both key off it
// verbatim ('m' vs 'min', 'maj7' vs whatever else), so touching it would
// only risk breaking a lookup that was fine before.
export function transposeChord(chord: string, semitones: number): string {
  const m = chord.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!m) return chord
  const [, letter, accidental, rest] = m
  const newRoot = transposeNote(letter.toUpperCase() + accidental, semitones)

  const slash = rest.match(/^(.*)\/([A-Ga-g])([#b]?)$/)
  if (!slash) return newRoot + rest
  const [, quality, bassLetter, bassAccidental] = slash
  const newBass = transposeNote(bassLetter.toUpperCase() + bassAccidental, semitones)
  return newRoot + quality + '/' + newBass
}

// Transposes every chord token on chord-chart lines of pasted reference
// text (Ultimate-Guitar-style: a chord line above a lyric line) by
// `semitones`. Lyric lines, [Section] headers, and everything else about a
// chord line's own formatting (spacing used to align chords over syllables,
// bar-line '|' characters) are left untouched — only the chord tokens
// themselves are swapped in place, via the same line/token classification
// parseReference itself uses so the two never disagree about what counts as
// a chord.
export function transposeReferenceText(text: string, semitones: number): string {
  return text.split(/\r?\n/).map(rawLine => {
    const trimmed = rawLine.trim()
    if (!trimmed || !isChordLine(tokenize(trimmed))) return rawLine
    return rawLine.replace(/[^\s|]+/g, tok => {
      if (IGNORE_TOKEN_RE.test(tok) || !CHORD_TOKEN_RE.test(tok)) return tok
      return transposeChord(tok, semitones)
    })
  }).join('\n')
}
