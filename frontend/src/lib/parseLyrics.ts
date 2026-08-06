export interface LyricsBlock {
  name: string
  text: string
}

// Same convention as parseReference.ts's chord-chart headers, reused here so
// the two paste conventions stay visually consistent for the user. Exported
// so callers that need line-level detection (e.g. LyricsEditor's "scroll to
// last section" button) can test individual lines the same way this file
// does, instead of duplicating the pattern.
export const SECTION_HEADER_RE = /^\[([^\]]+)\]$/

// Parses pasted lyrics into an ordered list of blocks, one per [Name]
// header, each capturing every non-empty line up to the next header (or end
// of text). Lines before the first header have no section to attach to and
// are dropped.
export function parseLyrics(text: string): LyricsBlock[] {
  const blocks: LyricsBlock[] = []
  let current: LyricsBlock | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const header = line.match(SECTION_HEADER_RE)
    if (header) {
      current = { name: header[1].trim(), text: '' }
      blocks.push(current)
      continue
    }
    if (!line || !current) continue
    current.text = current.text ? current.text + '\n' + line : line
  }

  return blocks
}

// Renames one specific `[oldName]` header line to `[newName]`, leaving its
// lyric lines untouched — used when splitting a section, to carry the
// existing tag over to the new left/first half (the right half's lyrics
// aren't known, so nothing is inserted for it). `occurrence` picks which
// same-named header to rename when the name repeats (0 = first), using the
// same chronological, nth-occurrence convention as matchLyricsToSections.
export function renameSectionTagOccurrence(text: string, oldName: string, occurrence: number, newName: string): string {
  let seen = 0
  return text.split(/\r?\n/).map(line => {
    const trimmed = line.trim()
    const header = trimmed.match(SECTION_HEADER_RE)
    if (!header || header[1].trim() !== oldName) return line
    const isMatch = seen === occurrence
    seen += 1
    return isMatch ? line.replace(trimmed, `[${newName}]`) : line
  }).join('\n')
}
