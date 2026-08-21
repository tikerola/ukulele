import { memo, useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import type { ChordDictionary } from '../types'

interface Props {
  chords: string[]
  chordDict: ChordDictionary
  currentChord: string | null
  locked: boolean
  isReady: boolean
  onTapChord: (chord: string) => void
  onTapCountIn: () => void
  // Renames a palette chord in place (same slot, same keyboard shortcut) and
  // rewrites every timeline entry currently using it — e.g. fixing a typo'd
  // quality or swapping in a different voicing without having to re-tap
  // every occurrence already recorded.
  onRenameChord: (oldChord: string, newChord: string) => void
  // Toggles one string of a palette chord between played and muted — e.g.
  // this song's G# should skip its G string while keeping the rest as-is.
  onToggleChordString: (chord: string, stringIndex: number) => void
}

function getChordData(chordDict: ChordDictionary, chord: string) {
  if (chordDict[chord]) return chordDict[chord]
  const lower = chord.toLowerCase()
  for (const key of Object.keys(chordDict)) {
    if (key.toLowerCase() === lower) return chordDict[key]
  }
  return null
}

// Memoized so this doesn't re-render on every animation frame while the
// video plays. RecordingView's currentTime state updates every frame during
// playback (useYouTubePlayer's tick loop) — without this memo, the whole
// button/ChordDiagram tree re-rendered at that same rate for as long as the
// video played, which is exactly when a user is tapping chords. That churn
// measurably slowed down mouse clicks (routed through React's synthetic
// event system, competing with the constant re-renders) while keyboard
// shortcuts stayed snappy (a raw window keydown listener, dispatched
// outside React entirely) — see RecordingView's currentTimeRef for the
// other half of this fix.
export const ChordTapStrip = memo(function ChordTapStrip({ chords, chordDict, currentChord, locked, isReady, onTapChord, onTapCountIn, onRenameChord, onToggleChordString }: Props) {
  // Index (not name) of the tile currently showing the rename input —
  // chord names aren't unique enough to key off the string if the palette
  // ever has a duplicate.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(i: number, chord: string) {
    if (locked) return
    setEditingIdx(i)
    setEditValue(chord)
  }

  function commitEdit() {
    if (editingIdx === null) return
    const oldChord = chords[editingIdx]
    const newChord = editValue.trim()
    setEditingIdx(null)
    if (!oldChord || !newChord || newChord === oldChord) return
    onRenameChord(oldChord, newChord)
  }

  function cancelEdit() {
    setEditingIdx(null)
  }

  return (
    <div className="chord-buttons">
      <button
        className="chord-tap-btn chord-tap-btn-count-in"
        onClick={onTapCountIn}
        disabled={!isReady || locked}
        title="Tap to drop a count-in beat at the current position"
      >
        <span className="chord-tap-name">⏱ Count-in</span>
      </button>
      {chords.map((chord, i) => (
        editingIdx === i ? (
          <div key={i} className="chord-tap-tile">
            <div className="chord-tap-btn chord-tap-btn-editing">
              <span className="chord-tap-edit-hint">Click a string to mute it</span>
              <ChordDiagram
                chord={chord}
                data={getChordData(chordDict, chord)}
                size={0.85}
                onToggleString={si => onToggleChordString(chord, si)}
              />
              <input
                className="chord-tap-edit-input"
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit()
                  else if (e.key === 'Escape') cancelEdit()
                }}
              />
              <div className="chord-tap-edit-actions">
                <button className="btn-small" disabled={!editValue.trim()} onClick={commitEdit} title="Save name">✓</button>
                <button className="btn-ghost" onClick={cancelEdit} title="Cancel">×</button>
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="chord-tap-tile">
            <button
              className={`chord-tap-btn${currentChord === chord ? ' chord-tap-btn-current' : ''}`}
              onClick={() => onTapChord(chord)}
              disabled={!isReady || locked}
            >
              <span className="chord-tap-key">{i + 1}</span>
              <span className="chord-tap-name">{chord}</span>
              <ChordDiagram chord={chord} data={getChordData(chordDict, chord)} size={0.85} />
            </button>
            {!locked && (
              <button
                className="chord-tap-edit-btn"
                onClick={e => { e.stopPropagation(); startEdit(i, chord) }}
                title={`Replace ${chord} with a different chord`}
              >✎</button>
            )}
          </div>
        )
      ))}
    </div>
  )
})
