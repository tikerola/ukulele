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
}

// How much smaller a tied section's preview row renders relative to the
// active section's own chord size — mirrors SectionChordBoard's
// INACTIVE_ROW_SCALE (a row that just lost activeness) but a bit smaller
// still, since these rows carry no pulse/progress detail to fill the space.
const PREVIEW_CHORD_SCALE = 0.6

export function TiedSectionsBoard({ members, activeSection, activeBoard, chordDict, chordZoom, onSeek }: Props) {
  const previewSize = BASE_CHORD_SIZE * chordZoom * PREVIEW_CHORD_SCALE

  return (
    <div className="tied-sections-board">
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
