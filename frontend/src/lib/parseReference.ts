export interface ReferenceItem {
  chord: string
  section?: string
}

// Tokens that show up in chord charts but aren't chords: repeat markers,
// "no chord" markers, bar-line leftovers, etc. Filtered out before matching.
const IGNORE_TOKEN_RE = /^(?:x\d+|\d+x|\(x?\d+x?\)|n\.?c\.?|%|-{1,3})$/i

// Deliberately permissive rather than exhaustive — good enough to tell a
// chord token ("Cadd9", "G/B", "F#m7b5") apart from a lyric word.
const CHORD_QUALITY =
  'maj7|maj9|maj11|maj13|maj' +
  '|m7b5|m7#5|m7|m9|m11|m13|m6|m' +
  '|min7|min' +
  '|dim7|dim' +
  '|aug' +
  '|sus2|sus4|sus' +
  '|add9|add11|add2' +
  '|6/9|6|7sus4|7sus2|7|9|11|13|2|4|5'

const CHORD_TOKEN_RE = new RegExp(`^[A-G](?:#|b)?(?:${CHORD_QUALITY})?(?:/[A-G](?:#|b)?)?$`, 'i')

const SECTION_HEADER_RE = /^\[([^\]]+)\]$/

export function tokenize(line: string): string[] {
  return line.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean)
}

export function isChordLine(tokens: string[]): boolean {
  const relevant = tokens.filter(t => !IGNORE_TOKEN_RE.test(t))
  if (relevant.length === 0 || relevant.length > 16) return false
  const matched = relevant.filter(t => CHORD_TOKEN_RE.test(t))
  return matched.length / relevant.length >= 0.6
}

// Parses text copy-pasted from a chord chart (e.g. Ultimate Guitar's "Text"
// view — chord line above a lyric line, optional [Verse]/[Chorus] labels)
// into an ordered list of chords to use as a recording guide.
export function parseReference(text: string): ReferenceItem[] {
  const items: ReferenceItem[] = []
  let currentSection: string | undefined

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const header = line.match(SECTION_HEADER_RE)
    if (header) {
      currentSection = header[1].trim()
      continue
    }

    const tokens = tokenize(line)
    if (!isChordLine(tokens)) continue

    for (const tok of tokens) {
      if (IGNORE_TOKEN_RE.test(tok) || !CHORD_TOKEN_RE.test(tok)) continue
      items.push({ chord: tok, section: currentSection })
    }
  }

  return items
}

// Strips [Section] headers and chord lines out of the same pasted text,
// leaving just the lyric lines — a starting point for the Lyrics editor so
// the user doesn't have to retype (or re-paste and manually delete chords
// from) what they already pasted here.
export function extractLyricsOnly(text: string): string {
  const lines: string[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (SECTION_HEADER_RE.test(line)) continue
    if (isChordLine(tokenize(line))) continue
    lines.push(line)
  }

  return lines.join('\n')
}
