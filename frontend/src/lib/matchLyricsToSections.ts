import type { Section } from '../types'
import type { LyricsBlock } from './parseLyrics'

function chronologicalByName(sections: Section[]): { sorted: Section[]; byName: Map<string, Section[]> } {
  const sorted = [...sections].sort((a, b) => a.startTime - b.startTime)
  const byName = new Map<string, Section[]>()
  for (const s of sorted) {
    const arr = byName.get(s.name)
    if (arr) arr.push(s); else byName.set(s.name, [s])
  }
  return { sorted, byName }
}

// Matches lyric blocks to Section instances by name, in chronological
// order: the 1st [A] block goes to the 1st "A" section by startTime, the
// 2nd [A] block to the 2nd "A" section, etc. Extra blocks beyond the number
// of same-named sections are dropped; sections with no corresponding block
// are simply absent from the returned map. Blocks with no lyric lines under
// their header (the user tagged the section but left it empty, e.g. an
// instrumental) are also left out — there's nothing for Playalong to show,
// and this map also feeds the timeline's "has lyrics" note icon, which
// shouldn't light up for a tag with no actual words.
export function matchLyricsToSections(blocks: LyricsBlock[], sections: Section[]): Map<Section, string> {
  const { byName } = chronologicalByName(sections)

  const nextIndex = new Map<string, number>()
  const result = new Map<Section, string>()
  for (const block of blocks) {
    const idx = nextIndex.get(block.name) ?? 0
    nextIndex.set(block.name, idx + 1)
    const section = byName.get(block.name)?.[idx]
    if (section && block.text) result.set(section, block.text)
  }
  return result
}

// Which section the user should tag next, based on *where they left off*
// rather than which sections happen to be missing lyrics — an intentionally
// empty tag (e.g. "[Pre-Verse]" with no lines under it, for an instrumental
// break) still counts as addressed here, unlike matchLyricsToSections's map,
// so it doesn't keep getting suggested forever just because later sections
// were filled in around it. Resolves the *last* pasted block to the section
// it corresponds to (same nth-occurrence-of-name scheme as
// matchLyricsToSections, but counting every block, empty or not) and
// suggests whatever comes immediately after that section in the timeline.
export function nextSectionAfterLastTag(blocks: LyricsBlock[], sections: Section[]): Section | null {
  const { sorted, byName } = chronologicalByName(sections)
  if (blocks.length === 0) return sorted[0] ?? null

  const lastBlock = blocks[blocks.length - 1]
  const ordinal = blocks.filter(b => b.name === lastBlock.name).length - 1
  const lastSection = byName.get(lastBlock.name)?.[ordinal]
  if (!lastSection) return null

  const idx = sorted.indexOf(lastSection)
  return sorted[idx + 1] ?? null
}
