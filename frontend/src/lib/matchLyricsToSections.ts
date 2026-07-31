import type { Section } from '../types'
import type { LyricsBlock } from './parseLyrics'

// Matches lyric blocks to Section instances by name, in chronological
// order: the 1st [A] block goes to the 1st "A" section by startTime, the
// 2nd [A] block to the 2nd "A" section, etc. Extra blocks beyond the number
// of same-named sections are dropped; sections with no corresponding block
// are simply absent from the returned map.
export function matchLyricsToSections(blocks: LyricsBlock[], sections: Section[]): Map<Section, string> {
  const sorted = [...sections].sort((a, b) => a.startTime - b.startTime)

  const byName = new Map<string, Section[]>()
  for (const s of sorted) {
    const arr = byName.get(s.name)
    if (arr) arr.push(s); else byName.set(s.name, [s])
  }

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
