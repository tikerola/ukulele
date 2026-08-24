import type { ReactNode } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { BASE_CHORD_SIZE } from './SectionChordBoard'
import { buildChordGroups } from '../lib/chordGroups'
import type { ChordEntry, ChordDictionary, Section } from '../types'

interface TieMember {
  section: Section
  entries: ChordEntry[]
}

interface Props {
  members: TieMember[]
  activeSection: Section
  // The fully-rendered <SectionChordBoard> for the active member — built by
  // the caller (which already has every prop it needs) rather than
  // re-derived here, so this component only has to know how to lay out
  // rows, not how to drive pulsing/lyrics/next-chord preview.
  activeBoard: ReactNode
  chordDict: ChordDictionary
  chordZoom: number
  onSeek: (time: number) => void
  // Whether the song has lyrics anywhere. Shrinking the non-active preview
  // rows only makes sense as a trade-off against the lyrics carousel taking
  // up space on the active row — with no lyrics in the song at all, there's
  // nothing to trade off against, so every tied section reads better at the
  // same chord size as the active one.
  hasLyrics?: boolean
}

// How much smaller a tied section's preview row renders relative to the
// active section's own chord size — mirrors SectionChordBoard's
// INACTIVE_ROW_SCALE (a row that just lost activeness) but a bit smaller
// still, since these rows carry no pulse/progress detail to fill the space.
const PREVIEW_CHORD_SCALE = 0.6

export function TiedSectionsBoard({ members, activeSection, activeBoard, chordDict, chordZoom, onSeek, hasLyrics }: Props) {
  const previewSize = BASE_CHORD_SIZE * chordZoom * (hasLyrics ? PREVIEW_CHORD_SCALE : 1)
  // With no lyrics anywhere, every row renders the same chord size — so they
  // should also read as visually identical lines rather than one row
  // standing out as "current": same padding (equal gaps line to line) and no
  // background/opacity distinction for whichever section is active.
  const boardClassName = hasLyrics ? 'tied-sections-board' : 'tied-sections-board tied-sections-board-flat'

  return (
    <div className={boardClassName}>
      {members.map(({ section, entries }) =>
        section === activeSection ? (
          <div className="tied-section-row tied-section-row-active" key={`${section.name}:${section.startTime}`}>
            {activeBoard}
          </div>
        ) : (
          <button
            type="button"
            className="tied-section-row tied-section-row-preview"
            key={`${section.name}:${section.startTime}`}
            onClick={() => onSeek(section.startTime)}
            title={`Jump to "${section.name}"`}
          >
            <div className="tied-section-preview-chords">
              {buildChordGroups(entries).map(indices => {
                const chord = entries[indices[0]].chord
                return (
                  <div className="tied-section-preview-chord" key={indices[0]}>
                    <ChordDiagram chord={chord} data={chordDict[chord] ?? null} size={previewSize} accentHeight={13.3} nameFontSize={20} />
                  </div>
                )
              })}
            </div>
          </button>
        )
      )}
    </div>
  )
}
