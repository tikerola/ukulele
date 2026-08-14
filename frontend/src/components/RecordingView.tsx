import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChordTapStrip } from './ChordTapStrip'
import { Timeline, formatTime } from './Timeline'
import { ReferenceGuide } from './ReferenceGuide'
import { LyricsEditor } from './LyricsEditor'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useChordAudio } from '../hooks/useChordAudio'
import { useChordSync } from '../hooks/useChordSync'
import { parseReference } from '../lib/parseReference'
import { parseLyrics, renameSectionTagOccurrence } from '../lib/parseLyrics'
import { matchLyricsToSections, nextSectionAfterLastTag } from '../lib/matchLyricsToSections'
import { COUNT_IN_CHORD } from '../lib/countIn'
import { transposeChord, transposeReferenceText } from '../lib/transposeChord'
import type { ChordEntry, ChordDictionary, CreatorSnapshot, Section } from '../types'

interface Snapshot {
  timeline: ChordEntry[]
  sections: Section[]
  referencePointer: number
  lyrics: string
}

const HISTORY_LIMIT = 20

interface Props {
  videoId: string
  chords: string[]
  chordDict: ChordDictionary
  initialSnapshot?: CreatorSnapshot
  // Where to seek the video (and so the timeline playhead, which just
  // mirrors it) once the player's ready — set when arriving here from
  // Playalong mid-song, so playback picks up where it was left off instead
  // of resetting to the start.
  initialSeekTime?: number
  onDone: (timeline: ChordEntry[], snapshot: CreatorSnapshot, seekTime: number) => void
  onSnapshotChange: (snapshot: CreatorSnapshot) => void
  onChordsChange: (chords: string[]) => void
  onBack: () => void
}

export function RecordingView({ videoId, chords, chordDict, initialSnapshot, initialSeekTime, onDone, onSnapshotChange, onChordsChange, onBack }: Props) {
  const { containerRef, currentTime, duration, isReady, isPlaying, seekTo, play, pause } = useYouTubePlayer(videoId)
  // Applies the carried-over Playalong position exactly once, as soon as
  // the player can actually accept a seek — not in useState's initializer,
  // since the underlying YouTube player doesn't exist yet at that point.
  // Explicitly paused right after — YouTube's player has a habit of
  // resuming playback on its own once a seek lands, which would otherwise
  // dump the user into Creator with the video already running.
  const appliedInitialSeekRef = useRef(false)
  useEffect(() => {
    if (!isReady || appliedInitialSeekRef.current || initialSeekTime == null) return
    appliedInitialSeekRef.current = true
    seekTo(initialSeekTime)
    pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, initialSeekTime])
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
  const [showTiedLyrics, setShowTiedLyrics] = useState(initialSnapshot?.showTiedLyrics ?? false)
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])

  const [referenceText, setReferenceText] = useState(initialSnapshot?.reference ?? '')
  const [referencePointer, setReferencePointer] = useState(0)
  const referenceItems = useMemo(() => parseReference(referenceText), [referenceText])

  // Chords the UG paste box found that aren't in the recording palette yet
  // get appended (not replacing existing ones, so number-key shortcuts for
  // chords already tapped onto the timeline don't shift).
  const importChordsFromReference = useCallback((found: string[]) => {
    onChordsChange([...chords, ...found])
  }, [chords, onChordsChange])

  const [lyricsText, setLyricsText] = useState(initialSnapshot?.lyrics ?? '')
  // Importing from the UG paste box adds to whatever's already in the
  // Lyrics editor rather than clobbering it, in case the user pasted lyrics
  // there separately first.
  const importLyricsFromReference = useCallback((extracted: string) => {
    setLyricsText(prev => (prev.trim().length === 0 ? extracted : prev + '\n\n' + extracted))
  }, [])
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

  // Renames whichever [oldName] lyrics tag matches `section` — its position
  // among same-named sections (chronological, by startTime) is the same
  // "nth occurrence" convention matchLyricsToSections used to tag it in the
  // first place, so this keeps the two in sync. Shared by the split and
  // rename handlers below; both call it with `sections` still holding the
  // section's *old* name (Timeline fires these before its own
  // onSectionsChange), so the occurrence lookup is against the state the
  // tag was actually matched under.
  const renameSectionLyricsTag = useCallback((section: Section, newName: string) => {
    const sameName = sections.filter(s => s.name === section.name).sort((a, b) => a.startTime - b.startTime)
    const occurrence = sameName.indexOf(section)
    if (occurrence === -1) return
    setLyricsText(prev => renameSectionTagOccurrence(prev, section.name, occurrence, newName))
  }, [sections])

  // When Timeline splits a section, carries that section's lyrics tag (if
  // any) over to the new left/first half unchanged — same name change,
  // same lines. The right half is left untagged, since there's no way to
  // know which of the original lines belong to it; the user re-tags that
  // part by hand.
  const handleSectionSplit = useCallback((section: Section, newFirstName: string) => {
    renameSectionLyricsTag(section, newFirstName)
  }, [renameSectionLyricsTag])

  // When Timeline renames a section, carries its lyrics tag (if any) over
  // to the new name the same way.
  const handleSectionRename = useCallback((section: Section, newName: string) => {
    renameSectionLyricsTag(section, newName)
  }, [renameSectionLyricsTag])

  // Which of the two lower-right panels is showing — they share one column
  // since they're never needed side by side. Lyrics can be pasted in and
  // edited before any sections exist to tag them against — only the
  // per-section tag buttons above the textarea need sections, and those
  // just stay empty until the Timeline has some.
  const [setupTab, setSetupTab] = useState<'reference' | 'lyrics'>('reference')

  useEffect(() => {
    setReferencePointer(p => Math.min(p, referenceItems.length))
  }, [referenceItems.length])

  // Call before any mutation to timeline/sections so it can be undone later.
  // Also snapshots the lyrics text — not because plain typing in the Lyrics
  // editor needs to be undoable on its own, but because some timeline/section
  // actions (like splitting a section) rewrite a lyrics tag as a side
  // effect, and undoing that action should put the tag back too.
  function recordHistory() {
    setPast(p => [...p, { timeline, sections, referencePointer, lyrics: lyricsText }].slice(-HISTORY_LIMIT))
    setFuture([])
  }

  function undo() {
    setPast(p => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setFuture(f => [{ timeline, sections, referencePointer, lyrics: lyricsText }, ...f].slice(0, HISTORY_LIMIT))
      setTimeline(prev.timeline)
      setSections(prev.sections)
      setReferencePointer(prev.referencePointer)
      setLyricsText(prev.lyrics)
      setSelectedIdx(null)
      return p.slice(0, -1)
    })
  }

  function redo() {
    setFuture(f => {
      if (f.length === 0) return f
      const next = f[0]
      setPast(p => [...p, { timeline, sections, referencePointer, lyrics: lyricsText }].slice(-HISTORY_LIMIT))
      setTimeline(next.timeline)
      setSections(next.sections)
      setReferencePointer(next.referencePointer)
      setLyricsText(next.lyrics)
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
      showTiedLyrics,
    }), 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, sections, referenceText, lyricsText, startOffset, endOffset, locked, showTiedLyrics])

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

  // Rewrites the chord palette, every real timeline entry (count-in ticks
  // are untouched — they're not chords) and any chord tokens in the pasted
  // reference text, all by the same amount — e.g. for practicing along to a
  // pitch-shifted copy of the video that's no longer in the original key.
  // Not routed through recordHistory/undo (reference text and the chord
  // palette aren't part of that history to begin with, see Snapshot above) —
  // instead it's just its own inverse: transposing +1 then -1 lands back
  // exactly where it started, so the opposite button *is* the undo.
  const handleTranspose = useCallback((semitones: number) => {
    if (locked) return
    onChordsChange(chords.map(c => transposeChord(c, semitones)))
    setTimeline(prev => prev.map(entry => entry.chord === COUNT_IN_CHORD
      ? entry
      : { ...entry, chord: transposeChord(entry.chord, semitones) }))
    setReferenceText(prev => transposeReferenceText(prev, semitones))
  }, [locked, chords, onChordsChange])

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
    setSections(prev => prev
      // A section whose endTime falls in the swept range retracts to
      // whatever entry still stands closest to it inside the section's
      // range (e.g. a trailing fill beat added by Timeline's "Fill beats" —
      // see fillToNextChord) rather than being dropped outright; only when
      // nothing survives inside the range does it fall through to the
      // startTime/endTime filter below.
      .map(s => {
        if (!deletedTimes.has(s.endTime)) return s
        const survivors = timeline.filter(e => e.time >= s.startTime && e.time <= s.endTime && !deletedTimes.has(e.time))
        if (survivors.length === 0) return s
        return { ...s, endTime: Math.max(...survivors.map(e => e.time)) }
      })
      .filter(s => !deletedTimes.has(s.startTime) && !deletedTimes.has(s.endTime)))
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
            className="btn-ghost"
            onClick={() => onDone(timeline, {
              timeline, sections, reference: referenceText, lyrics: lyricsText, startOffset, endOffset, locked,
              showNextChordPreview: initialSnapshot?.showNextChordPreview,
              showTiedLyrics,
            }, currentTimeRef.current)}
            disabled={timeline.length === 0}
            title={timeline.length === 0 ? 'Record at least one chord first' : 'Switch to Playalong'}
          >
            ▶ Playalong
          </button>
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
          <div
            className="zoom-controls"
            title="Transpose the chord palette, timeline and pasted reference chords by a semitone — e.g. for practicing along to a pitch-shifted copy of the video"
          >
            <span className="zoom-label">🎼</span>
            <button className="btn-ghost zoom-btn" onClick={() => handleTranspose(-1)} disabled={locked} title="Transpose down a semitone">－</button>
            <button className="btn-ghost zoom-btn" onClick={() => handleTranspose(1)} disabled={locked} title="Transpose up a semitone">＋</button>
          </div>
          <button
            className={`btn-ghost${isPlaying ? ' btn-ghost-active' : ''}`}
            onClick={() => (isPlaying ? pause() : play())}
            disabled={!isReady}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => seekTo(startOffset ?? 0)}
            disabled={!isReady}
            title="Rewind to the start"
          >
            ⏮ Start
          </button>
          <button className="btn-ghost" onClick={onBack}>← New song</button>
        </div>
      </header>

      <div className="recording-body-v2">
        <div ref={containerRef} className="yt-audio-only" />

        {/* Timeline spans the full width and takes whatever height is left
            after the lower row — it's the actual editing surface, so it
            gets first claim on space rather than sharing a column with
            anything else. */}
        <div className="creator-timeline-row">
          {isReady && duration > 0 ? (
            <Timeline
              timeline={timeline}
              duration={duration}
              currentTime={currentTime}
              selectedIdx={selectedIdx}
              onSelectChange={setSelectedIdx}
              onChange={setTimeline}
              onSeek={seekTo}
              onPlay={play}
              locked={locked}
              sections={sections}
              lyricsBySection={lyricsBySection}
              onSectionsChange={setSections}
              onSectionSplit={handleSectionSplit}
              onSectionRename={handleSectionRename}
              onBeginEdit={recordHistory}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onUndo={undo}
              onRedo={redo}
              startOffset={startOffset}
              endOffset={endOffset}
              onStartOffsetChange={setStartOffset}
              onEndOffsetChange={setEndOffset}
              showTiedLyrics={showTiedLyrics}
              onShowTiedLyricsChange={setShowTiedLyrics}
            />
          ) : (
            <div className="timeline-loading">Waiting for video to load…</div>
          )}
        </div>

        {/* A fixed-height strip below the Timeline, split into the chord
            charts (left) and one tabbed panel (right) that shows either the
            Ultimate-Guitar-style reference chart or the lyrics editor —
            they're never needed side by side, so sharing a column beats
            permanently giving up screen space to whichever one is idle. */}
        <div className="creator-lower-row">
          <div className="creator-chords-col">
            <div className="tap-instructions">
              {locked
                ? <>🔒 Timeline locked — unlock to make edits</>
                : selectedIdx !== null && timeline[selectedIdx]
                  ? <>Selected <strong>{timeline[selectedIdx].chord}</strong> @ {formatTime(timeline[selectedIdx].time)} — click a chord to change it · <kbd>Esc</kbd> to deselect</>
                  : <>Click a chord to record it at the current position {isPlaying ? '(playing)' : '(paused)'} · <kbd>1</kbd>–<kbd>{chords.length}</kbd> · <kbd>Space</kbd> play/pause · tap Count-in for a lead-in beat</>
              }
            </div>
            <ChordTapStrip
              chords={chords}
              chordDict={chordDict}
              currentChord={selectedIdx !== null ? timeline[selectedIdx]?.chord ?? null : null}
              locked={locked}
              isReady={isReady}
              onTapChord={assignChord}
              onTapCountIn={assignCountIn}
            />
          </div>

          <div className="creator-tabs-col">
            <div className="creator-tabs-bar">
              <button
                className={`creator-tab${setupTab === 'reference' ? ' creator-tab-active' : ''}`}
                onClick={() => setSetupTab('reference')}
              >
                UG
              </button>
              <button
                className={`creator-tab${setupTab === 'lyrics' ? ' creator-tab-active' : ''}`}
                onClick={() => setSetupTab('lyrics')}
              >
                Lyrics
              </button>
            </div>
            <div className="creator-tabs-body">
              {setupTab === 'lyrics' ? (
                <LyricsEditor
                  text={lyricsText}
                  onTextChange={setLyricsText}
                  sectionNames={sectionNames}
                  nextSectionName={nextUntaggedSectionName}
                  locked={locked}
                />
              ) : (
                <ReferenceGuide
                  text={referenceText}
                  onTextChange={setReferenceText}
                  items={referenceItems}
                  pointer={referencePointer}
                  onPointerChange={setReferencePointer}
                  locked={locked}
                  knownChords={chords}
                  onImportChords={importChordsFromReference}
                  lyricsText={lyricsText}
                  onImportLyrics={importLyricsFromReference}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
