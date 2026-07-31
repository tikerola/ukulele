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
