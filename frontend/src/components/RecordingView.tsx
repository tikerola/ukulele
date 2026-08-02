import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChordTapStrip } from './ChordTapStrip'
import { Timeline, formatTime } from './Timeline'
import { ReferenceGuide } from './ReferenceGuide'
import { LyricsEditor } from './LyricsEditor'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useChordAudio } from '../hooks/useChordAudio'
import { useChordSync } from '../hooks/useChordSync'
import { parseReference } from '../lib/parseReference'
import { parseLyrics } from '../lib/parseLyrics'
import { matchLyricsToSections, nextSectionAfterLastTag } from '../lib/matchLyricsToSections'
import { COUNT_IN_CHORD } from '../lib/countIn'
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
  // assignChord/assignCountIn read the latest time from here instead of
  // closing over `currentTime` directly, so they don't need it in their own
  // dependency arrays. currentTime updates every animation frame while the
  // video plays (useYouTubePlayer's tick loop) — if those callbacks
  // depended on it, they (and everything holding onto them, like the
  // tap-strip's onClick props) would be recreated at that same rate for as
  // long as the video played, which is exactly when a user is tapping
  // chords.
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  const { playChord } = useChordAudio()
  const [soundOn, setSoundOn] = useState(true)
  const [timeline, setTimeline] = useState<ChordEntry[]>(initialSnapshot?.timeline ?? [])
  const [sections, setSections] = useState<Section[]>(initialSnapshot?.sections ?? [])
  const [startOffset, setStartOffset] = useState<number | undefined>(initialSnapshot?.startOffset)
  const [endOffset, setEndOffset] = useState<number | undefined>(initialSnapshot?.endOffset)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [locked, setLocked] = useState(initialSnapshot?.locked ?? !!initialSnapshot?.timeline.length)
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])

  const [referenceText, setReferenceText] = useState(initialSnapshot?.reference ?? '')
  const [referencePointer, setReferencePointer] = useState(0)
  const referenceItems = useMemo(() => parseReference(referenceText), [referenceText])

  const [lyricsText, setLyricsText] = useState(initialSnapshot?.lyrics ?? '')
  const sectionNames = useMemo(() => Array.from(new Set(sections.map(s => s.name))), [sections])
  const lyricsBlocks = useMemo(() => parseLyrics(lyricsText), [lyricsText])
  // Same matching Playalong uses to pick which lyric block a section shows
  // — reused here just to know *whether* a section has one, so the
  // timeline can flag it without duplicating the matching logic.
  const lyricsBySection = useMemo(
    () => matchLyricsToSections(lyricsBlocks, sections),
    [lyricsBlocks, sections]
  )
  // Which section to suggest tagging next in LyricsEditor — based on where
  // the user left off (the last pasted block), not just "first section with
  // no lyrics", so an intentionally empty tag (e.g. an instrumental
  // "[Pre-Verse]") doesn't get suggested forever once they've moved on and
  // tagged sections after it.
  const nextUntaggedSectionName = useMemo(
    () => nextSectionAfterLastTag(lyricsBlocks, sections)?.name ?? null,
    [lyricsBlocks, sections]
  )

  // Collapsing the chord/count-in tap buttons frees up vertical room between
  // the lyrics editor and the timeline — handy while tagging lyrics with
  // section names, which needs both on screen at once but no chord taps.
  const [chordsCollapsed, setChordsCollapsed] = useState(false)

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
    const t = setTimeout(() => onSnapshotChange({
      timeline, sections, reference: referenceText, lyrics: lyricsText, startOffset, endOffset, locked,
      showNextChordPreview: initialSnapshot?.showNextChordPreview,
    }), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, sections, referenceText, lyricsText, startOffset, endOffset, locked])

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
    setTimeline(prev => [...prev, { time: currentTimeRef.current, chord }].sort((a, b) => a.time - b.time))
    setReferencePointer(p => Math.min(p + 1, referenceItems.length))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn, chordDict, playChord, selectedIdx, locked, timeline, sections, referencePointer, referenceItems.length])

  // A count-in tick has no chord sound and no corresponding lyrics/reference
  // item, so unlike assignChord it skips both the chord-audio playback and
  // the referencePointer advance — otherwise identical (including editing
  // the selected entry in place, so an existing marker can be converted to
  // a count-in tick the same way it can be converted to a chord).
  const assignCountIn = useCallback(() => {
    if (locked) return
    recordHistory()
    if (selectedIdx !== null) {
      setTimeline(prev => prev.map((entry, i) => i === selectedIdx ? { ...entry, chord: COUNT_IN_CHORD } : entry))
      return
    }
    setTimeline(prev => [...prev, { time: currentTimeRef.current, chord: COUNT_IN_CHORD }].sort((a, b) => a.time - b.time))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, locked, timeline, sections])

  // Holding Alt while the video plays arms punch-in overwrite: any chord
  // tap made while it's held (below) starts a sweep from that tap's time,
  // and as currentTime keeps advancing while Alt stays down, every
  // existing entry the playhead sweeps past gets deleted. Tapping a
  // *different* chord mid-sweep, still without releasing Alt, both writes
  // the new chord right there and (by moving sweepStart forward) hands the
  // sweep off to it, so you can switch chords smoothly mid-punch-in instead
  // of only ever overwriting with whichever one you started with. Without
  // Alt held, chord keys are just plain taps, same as ever. (Ctrl was the
  // first choice, but Ctrl+1..9 are browser tab-switch shortcuts handled
  // below page JS, so Alt avoids that collision.)
  const altHeldRef = useRef(false)
  const overwriteRef = useRef<{ sweepStart: number } | null>(null)

  useEffect(() => {
    const active = overwriteRef.current
    if (!active || locked) return
    const inSweep = (t: number) => t > active.sweepStart && t <= currentTime
    if (!timeline.some(e => inSweep(e.time))) return
    const deletedTimes = new Set(timeline.filter(e => inSweep(e.time)).map(e => e.time))
    setTimeline(prev => prev.filter(e => !inSweep(e.time)))
    setSections(prev => prev.filter(s => !deletedTimes.has(s.startTime) && !deletedTimes.has(s.endTime)))
  }, [currentTime, timeline, locked])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Alt') { altHeldRef.current = true; return }
      if (e.code === 'Space') {
        e.preventDefault()
        // A focused chord/tap button would otherwise "activate" (re-tap
        // the chord) on the same spacebar press once it's released.
        ;(document.activeElement as HTMLElement | null)?.blur()
        if (isPlaying) pause(); else play()
        return
      }
      if (e.key === 'Escape') { setSelectedIdx(null); overwriteRef.current = null; return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, currentTimeRef.current - 2)); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(Math.min(duration, currentTimeRef.current + 2)); return }
      // OS key-repeat would otherwise re-tap the same chord every ~30-50ms
      // for as long as it's held.
      if (e.repeat) return
      const i = parseInt(e.key) - 1
      if (i < 0 || i >= chords.length) return
      assignChord(chords[i])
      if (selectedIdx === null && altHeldRef.current) {
        overwriteRef.current = { sweepStart: currentTimeRef.current }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Alt') {
        altHeldRef.current = false
        overwriteRef.current = null
      }
    }
    // Safety net: if Alt is released while the window doesn't have focus
    // (e.g. switching to another window mid-hold), no keyup ever reaches
    // us — without this the sweep would keep deleting indefinitely once
    // focus returns and currentTime resumes advancing.
    function onBlur() {
      altHeldRef.current = false
      overwriteRef.current = null
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [chords, assignChord, isPlaying, play, pause, seekTo, duration, selectedIdx])

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
          locked={locked}
        />

        {sections.length > 0 && (
          <LyricsEditor
            text={lyricsText}
            onTextChange={setLyricsText}
            sectionNames={sectionNames}
            nextSectionName={nextUntaggedSectionName}
            locked={locked}
          />
        )}

        <div className="tap-strip">
          <div className="tap-strip-header">
            <div className="tap-instructions">
              {locked
                ? <>🔒 Timeline locked — unlock to make edits</>
                : selectedIdx !== null && timeline[selectedIdx]
                  ? <>Selected <strong>{timeline[selectedIdx].chord}</strong> @ {formatTime(timeline[selectedIdx].time)} — click a chord to change it · <kbd>Esc</kbd> to deselect</>
                  : <>Click a chord to record it at the current position {isPlaying ? '(playing)' : '(paused)'} · <kbd>1</kbd>–<kbd>{chords.length}</kbd> · <kbd>Space</kbd> play/pause · tap Count-in for a lead-in beat</>
              }
            </div>
            <button
              className="btn-small"
              onClick={() => setChordsCollapsed(v => !v)}
              title={chordsCollapsed ? 'Show the chord and count-in tap buttons' : 'Hide the chord and count-in tap buttons to make more room for the lyrics and timeline'}
            >
              {chordsCollapsed ? '▸ Show chords' : '▾ Hide chords'}
            </button>
          </div>
          {!chordsCollapsed && (
            <ChordTapStrip
              chords={chords}
              chordDict={chordDict}
              currentChord={selectedIdx !== null ? timeline[selectedIdx]?.chord ?? null : null}
              locked={locked}
              isReady={isReady}
              onTapChord={assignChord}
              onTapCountIn={assignCountIn}
            />
          )}
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
            lyricsBySection={lyricsBySection}
            onSectionsChange={setSections}
            onBeginEdit={recordHistory}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            onUndo={undo}
            onRedo={redo}
            startOffset={startOffset}
            endOffset={endOffset}
            onStartOffsetChange={setStartOffset}
            onEndOffsetChange={setEndOffset}
          />
        ) : (
          <div className="timeline-loading">Waiting for video to load…</div>
        )}

        <div className="tap-footer">
          <button
            className="btn-primary"
            onClick={() => onDone(timeline, {
              timeline, sections, reference: referenceText, lyrics: lyricsText, startOffset, endOffset, locked,
              showNextChordPreview: initialSnapshot?.showNextChordPreview,
            })}
            disabled={timeline.length === 0}
          >
            ▶ Playalong
          </button>
        </div>
      </div>
    </div>
  )
}
