import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { Timeline, formatTime } from './Timeline'
import { ReferenceGuide } from './ReferenceGuide'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useChordAudio } from '../hooks/useChordAudio'
import { useChordSync } from '../hooks/useChordSync'
import { parseReference } from '../lib/parseReference'
import type { ChordEntry, ChordDictionary, CreatorSnapshot, Section } from '../types'

interface Snapshot {
  timeline: ChordEntry[]
  sections: Section[]
  referencePointer: number
}

const HISTORY_LIMIT = 20

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
  const { containerRef, currentTime, duration, isReady, isPlaying, seekTo, play, pause } = useYouTubePlayer(videoId)
  const { playChord } = useChordAudio()
  const [soundOn, setSoundOn] = useState(true)
  const [timeline, setTimeline] = useState<ChordEntry[]>(initialSnapshot?.timeline ?? [])
  const [sections, setSections] = useState<Section[]>(initialSnapshot?.sections ?? [])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [locked, setLocked] = useState(!!initialSnapshot?.timeline.length)
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])

  const [referenceText, setReferenceText] = useState(initialSnapshot?.reference ?? '')
  const [referencePointer, setReferencePointer] = useState(0)
  const referenceItems = useMemo(() => parseReference(referenceText), [referenceText])

  useEffect(() => {
    setReferencePointer(p => Math.min(p, referenceItems.length))
  }, [referenceItems.length])

  // Call before any mutation to timeline/sections so it can be undone later.
  function recordHistory() {
    setPast(p => [...p, { timeline, sections, referencePointer }].slice(-HISTORY_LIMIT))
    setFuture([])
  }

  function undo() {
    setPast(p => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setFuture(f => [{ timeline, sections, referencePointer }, ...f].slice(0, HISTORY_LIMIT))
      setTimeline(prev.timeline)
      setSections(prev.sections)
      setReferencePointer(prev.referencePointer)
      setSelectedIdx(null)
      return p.slice(0, -1)
    })
  }

  function redo() {
    setFuture(f => {
      if (f.length === 0) return f
      const next = f[0]
      setPast(p => [...p, { timeline, sections, referencePointer }].slice(-HISTORY_LIMIT))
      setTimeline(next.timeline)
      setSections(next.sections)
      setReferencePointer(next.referencePointer)
      setSelectedIdx(null)
      return f.slice(1)
    })
  }

  useEffect(() => {
    if (locked) setSelectedIdx(null)
  }, [locked])

  const skipNextSaveRef = useRef(true)
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    const t = setTimeout(() => onSnapshotChange({ timeline, sections, reference: referenceText }), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, sections, referenceText])

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
    recordHistory()
    if (selectedIdx !== null) {
      setTimeline(prev => prev.map((entry, i) => i === selectedIdx ? { ...entry, chord } : entry))
      return
    }
    setTimeline(prev => [...prev, { time: currentTime, chord }].sort((a, b) => a.time - b.time))
    setReferencePointer(p => Math.min(p + 1, referenceItems.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, soundOn, chordDict, playChord, selectedIdx, locked, timeline, sections, referencePointer, referenceItems.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        // A focused chord/tap button would otherwise "activate" (re-tap
        // the chord) on the same spacebar press once it's released.
        ;(document.activeElement as HTMLElement | null)?.blur()
        if (isPlaying) pause(); else play()
        return
      }
      if (e.key === 'Escape') { setSelectedIdx(null); return }
      const i = parseInt(e.key) - 1
      if (i >= 0 && i < chords.length) assignChord(chords[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chords, assignChord, isPlaying, play, pause])

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
          <button
            className={`btn-ghost${isPlaying ? ' btn-ghost-active' : ''}`}
            onClick={() => (isPlaying ? pause() : play())}
            disabled={!isReady}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="btn-ghost" onClick={() => seekTo(Math.max(0, currentTime - 5))} title="Rewind 5 seconds">⏪ 5s</button>
          <button className="btn-ghost" onClick={onBack}>← New song</button>
        </div>
      </header>

      <div className="recording-body-v2">
        <div ref={containerRef} className="yt-audio-only" />

        <ReferenceGuide
          text={referenceText}
          onTextChange={setReferenceText}
          items={referenceItems}
          pointer={referencePointer}
          onPointerChange={setReferencePointer}
        />

        <div className="tap-strip">
          <div className="tap-instructions">
            {locked
              ? <>🔒 Timeline locked — unlock to make edits</>
              : selectedIdx !== null && timeline[selectedIdx]
                ? <>Selected <strong>{timeline[selectedIdx].chord}</strong> @ {formatTime(timeline[selectedIdx].time)} — click a chord to change it · <kbd>Esc</kbd> to deselect</>
                : <>Click a chord to record it at the current position {isPlaying ? '(playing)' : '(paused)'} · <kbd>1</kbd>–<kbd>{chords.length}</kbd> · <kbd>Space</kbd> play/pause</>
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
            onBeginEdit={recordHistory}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            onUndo={undo}
            onRedo={redo}
          />
        ) : (
          <div className="timeline-loading">Waiting for video to load…</div>
        )}

        <div className="tap-footer">
          <button
            className="btn-primary"
            onClick={() => onDone(timeline, { timeline, sections, reference: referenceText })}
            disabled={timeline.length === 0}
          >
            ▶ Playalong
          </button>
        </div>
      </div>
    </div>
  )
}
