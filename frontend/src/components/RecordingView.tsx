import { useCallback, useEffect, useRef, useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { Timeline, formatTime } from './Timeline'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useChordAudio } from '../hooks/useChordAudio'
import { useChordSync } from '../hooks/useChordSync'
import type { ChordEntry, ChordDictionary, CreatorSnapshot, Section } from '../types'

interface Props {
  videoId: string
  chords: string[]
  chordDict: ChordDictionary
  initialSnapshot?: CreatorSnapshot
  onDone: (timeline: ChordEntry[], snapshot: CreatorSnapshot) => void
  onSnapshotChange: (snapshot: CreatorSnapshot) => void
  onBack: () => void
}

export function RecordingView({ videoId, chords, chordDict, initialSnapshot, onDone, onSnapshotChange, onBack }: Props) {
  const { containerRef, currentTime, duration, isReady, isPlaying, seekTo } = useYouTubePlayer(videoId)
  const { playChord } = useChordAudio()
  const [soundOn, setSoundOn] = useState(true)
  const [timeline, setTimeline] = useState<ChordEntry[]>(initialSnapshot?.timeline ?? [])
  const [sections, setSections] = useState<Section[]>(initialSnapshot?.sections ?? [])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [locked, setLocked] = useState(!!initialSnapshot?.timeline.length)

  useEffect(() => {
    if (locked) setSelectedIdx(null)
  }, [locked])

  const skipNextSaveRef = useRef(true)
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    const t = setTimeout(() => onSnapshotChange({ timeline, sections }), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, sections])

  const { currentIdx } = useChordSync(timeline, currentTime)
  const lastPulseIdxRef = useRef(-1)

  useEffect(() => {
    if (!isPlaying || !soundOn) return
    if (currentIdx === -1 || currentIdx === lastPulseIdxRef.current) return
    lastPulseIdxRef.current = currentIdx
    const chord = timeline[currentIdx]?.chord
    const data = chord ? getChordData(chord) : null
    if (data) playChord(data.frets)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, isPlaying, soundOn, timeline, playChord])

  function getChordData(chord: string) {
    if (chordDict[chord]) return chordDict[chord]
    const lower = chord.toLowerCase()
    for (const key of Object.keys(chordDict)) {
      if (key.toLowerCase() === lower) return chordDict[key]
    }
    return null
  }

  const assignChord = useCallback((chord: string) => {
    if (locked) return
    if (soundOn) {
      const data = getChordData(chord)
      if (data) playChord(data.frets)
    }
    if (selectedIdx !== null) {
      setTimeline(prev => prev.map((entry, i) => i === selectedIdx ? { ...entry, chord } : entry))
      return
    }
    setTimeline(prev => [...prev, { time: currentTime, chord }].sort((a, b) => a.time - b.time))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, soundOn, chordDict, playChord, selectedIdx, locked])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') { setSelectedIdx(null); return }
      const i = parseInt(e.key) - 1
      if (i >= 0 && i < chords.length) assignChord(chords[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chords, assignChord])

  return (
    <div className="recording-screen">
      <header className="app-header app-header-compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>UkeSync</h1>
          <span className="mode-badge mode-badge-creator">Creator</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className={`btn-ghost${locked ? ' btn-ghost-active' : ''}`}
            onClick={() => setLocked(v => !v)}
            title={locked ? 'Unlock to allow editing' : 'Lock timeline to prevent accidental edits'}
          >
            {locked ? '🔒' : '🔓'}
          </button>
          <button
            className={`btn-ghost${soundOn ? ' btn-ghost-active' : ''}`}
            onClick={() => setSoundOn(v => !v)}
            title={soundOn ? 'Mute chord sound' : 'Play chord sound when recording'}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn-ghost" onClick={() => seekTo(Math.max(0, currentTime - 5))} title="Rewind 5 seconds">⏪ 5s</button>
          <button className="btn-ghost" onClick={onBack}>← New song</button>
        </div>
      </header>

      <div className="recording-body-v2">
        <div className="recording-video-col">
          <div className="yt-wrapper">
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {!isReady && <div className="yt-loading">Loading player…</div>}
          </div>
        </div>

        <div className="tap-strip">
          <div className="tap-instructions">
            {locked
              ? <>🔒 Timeline locked — unlock to make edits</>
              : selectedIdx !== null && timeline[selectedIdx]
                ? <>Selected <strong>{timeline[selectedIdx].chord}</strong> @ {formatTime(timeline[selectedIdx].time)} — click a chord to change it · <kbd>Esc</kbd> to deselect</>
                : <>Click a chord to record it at the current position {isPlaying ? '(playing)' : '(paused)'} · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
            }
          </div>
          <div className="chord-buttons">
            {chords.map((chord, i) => (
              <button
                key={chord}
                className={`chord-tap-btn${selectedIdx !== null && timeline[selectedIdx]?.chord === chord ? ' chord-tap-btn-current' : ''}`}
                onClick={() => assignChord(chord)}
                disabled={!isReady || locked}
              >
                <span className="chord-tap-key">{i + 1}</span>
                <span className="chord-tap-name">{chord}</span>
                <ChordDiagram chord={chord} data={getChordData(chord)} size={0.85} />
              </button>
            ))}
          </div>
        </div>

        {isReady && duration > 0 ? (
          <Timeline
            timeline={timeline}
            duration={duration}
            currentTime={currentTime}
            selectedIdx={selectedIdx}
            onSelectChange={setSelectedIdx}
            onChange={setTimeline}
            onSeek={seekTo}
            locked={locked}
            sections={sections}
            onSectionsChange={setSections}
          />
        ) : (
          <div className="timeline-loading">Waiting for video to load…</div>
        )}

        <div className="tap-footer">
          <button
            className="btn-primary"
            onClick={() => onDone(timeline, { timeline, sections })}
            disabled={timeline.length === 0}
          >
            ▶ Playalong
          </button>
        </div>
      </div>
    </div>
  )
}
