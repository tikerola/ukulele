import { memo } from 'react'
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
export const ChordTapStrip = memo(function ChordTapStrip({ chords, chordDict, currentChord, locked, isReady, onTapChord, onTapCountIn }: Props) {
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
        <button
          key={chord}
          className={`chord-tap-btn${currentChord === chord ? ' chord-tap-btn-current' : ''}`}
          onClick={() => onTapChord(chord)}
          disabled={!isReady || locked}
        >
          <span className="chord-tap-key">{i + 1}</span>
          <span className="chord-tap-name">{chord}</span>
          <ChordDiagram chord={chord} data={getChordData(chordDict, chord)} size={0.85} />
        </button>
      ))}
    </div>
  )
})
