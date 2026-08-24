import { useId, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ChordDictionary, ChordEntry, AppState, CreatorSnapshot, Section, SavedSong } from './types'
import { ChordOverlay } from './components/ChordOverlay'
import { SectionChordBoard } from './components/SectionChordBoard'
import { TiedSectionsBoard } from './components/TiedSectionsBoard'
import { RecordingView } from './components/RecordingView'
import { formatTime } from './components/Timeline'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { useAudioFilePlayer } from './hooks/useAudioFilePlayer'
import { useChordAudio } from './hooks/useChordAudio'
import { useSectionChords } from './hooks/useChordSync'
import { useScreenRecorder } from './hooks/useScreenRecorder'
import { COUNT_IN_CHORD } from './lib/countIn'
import { parseLyrics } from './lib/parseLyrics'
import { matchLyricsToSections } from './lib/matchLyricsToSections'

const API = '/api'

// Playalong's chord-chart and lyrics zoom are independent display
// preferences, not part of a song's saved data — they apply across every
// song, so each is kept in its own localStorage slot (persists across
// reloads) rather than in CreatorSnapshot.
const CHORD_ZOOM_STORAGE_KEY = 'ukesync-playalong-chord-zoom'
const LYRICS_ZOOM_STORAGE_KEY = 'ukesync-playalong-lyrics-zoom'
const ZOOM_MIN = 0.7
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1

function loadZoom(storageKey: string): number {
  const raw = Number(localStorage.getItem(storageKey))
  return raw >= ZOOM_MIN && raw <= ZOOM_MAX ? raw : 1
}

// Keeps the audio-file control's label from dominating the already-busy
// Playalong header — the full name is still available via the title
// tooltip on the element this is used in.
function truncateFileName(name: string, maxChars = 5): string {
  return name.length > maxChars ? name.slice(0, maxChars) + '…' : name
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function parseChords(input: string): string[] {
  return input.split(/\s+/).filter(s => s.length > 0)
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

// ─── Home screen ────────────────────────────────────────────────

const URL_PLACEHOLDER = 'https://www.youtube.com/watch?v=ONdsLfVZMso'
const CHORDS_PLACEHOLDER = 'Am G Dm'

function InputForm({ onStart, isLoading, savedSongs, onDeleteSaved }: { onStart: (url: string, chords: string[]) => void; isLoading?: boolean; savedSongs: SavedSong[]; onDeleteSaved: (videoId: string) => Promise<void> }) {
  const [mode, setMode] = useState<'new' | 'saved'>('new')
  const [url, setUrl] = useState('')
  const [chordText, setChordText] = useState('')
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const urlId = useId()
  const chordsId = useId()
  const savedId = useId()

  function selectSaved(videoId: string) {
    const song = savedSongs.find(s => s.video_id === videoId)
    if (!song) return
    setSelectedVideoId(videoId)
    setUrl(watchUrl(videoId))
    setChordText(song.chords.join(' '))
  }

  function handleModeChange(next: 'new' | 'saved') {
    setMode(next)
    if (next === 'saved') {
      if (savedSongs.length > 0) selectSaved(savedSongs[0].video_id)
    } else {
      setSelectedVideoId('')
      setUrl('')
      setChordText('')
    }
  }

  // If the selected song disappears from the list (deleted, here or elsewhere),
  // fall back to the next one — or back to "New song" if none are left.
  useEffect(() => {
    if (mode !== 'saved') return
    if (savedSongs.length === 0) {
      handleModeChange('new')
      return
    }
    if (!savedSongs.some(s => s.video_id === selectedVideoId)) {
      selectSaved(savedSongs[0].video_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSongs])

  async function handleDelete() {
    const song = savedSongs.find(s => s.video_id === selectedVideoId)
    if (!song) return
    const label = song.title ?? song.video_id
    if (!window.confirm(`Delete "${label}" from saved songs? This can't be undone.`)) return
    setIsDeleting(true)
    await onDeleteSaved(song.video_id)
    setIsDeleting(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const chords = parseChords(chordText)
    if (!url.trim()) return

    if (mode === 'new') {
      const vid = extractVideoId(url.trim())
      const existing = vid ? savedSongs.find(s => s.video_id === vid) : undefined
      if (existing) {
        const label = existing.title ?? existing.video_id
        window.alert(`"${label}" is already saved. Open it from the "Saved songs" tab instead.`)
        return
      }
    }

    onStart(url.trim(), chords)
  }

  const usingSaved = mode === 'saved' && savedSongs.length > 0

  return (
    <div className="input-screen">
      <header className="app-header">
        <h1>UkeSync</h1>
        <p className="tagline">Ukulele playalong from YouTube — create once, play forever</p>
      </header>

      <div className="mode-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          className={`mode-toggle-btn${mode === 'new' ? ' mode-toggle-btn-active' : ''}`}
          onClick={() => handleModeChange('new')}
        >
          New song
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'saved'}
          className={`mode-toggle-btn${mode === 'saved' ? ' mode-toggle-btn-active' : ''}`}
          onClick={() => handleModeChange('saved')}
          disabled={savedSongs.length === 0}
          title={savedSongs.length === 0 ? 'No saved songs yet' : undefined}
        >
          Saved songs{savedSongs.length > 0 ? ` (${savedSongs.length})` : ''}
        </button>
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        {mode === 'saved' && (
          savedSongs.length === 0 ? (
            <p className="field-hint">You haven't saved any songs yet — switch to "New song" to create one.</p>
          ) : (
            <div className="field">
              <label htmlFor={savedId}>Saved song</label>
              <select id={savedId} value={selectedVideoId} onChange={e => selectSaved(e.target.value)}>
                {savedSongs.map(s => (
                  <option key={s.video_id} value={s.video_id}>
                    {s.title ?? s.video_id} — {s.chords.join(', ') || 'no chords yet'}
                  </option>
                ))}
              </select>
            </div>
          )
        )}

        <div className="field">
          <label htmlFor={urlId}>YouTube URL</label>
          <input
            id={urlId}
            type="url"
            placeholder={URL_PLACEHOLDER}
            value={url}
            onChange={e => setUrl(e.target.value)}
            readOnly={usingSaved}
            required
          />
        </div>

        <div className="field">
          <label htmlFor={chordsId}>Chords in this song <span className="field-optional">(optional)</span></label>
          <textarea
            id={chordsId}
            rows={3}
            placeholder={CHORDS_PLACEHOLDER}
            value={chordText}
            onChange={e => setChordText(e.target.value)}
          />
          <span className="field-hint">
            {usingSaved
              ? 'Add more chords here if the recording needs them — you can record the new ones onto the timeline in Creator mode'
              : "List every unique chord, or leave this blank and import them from Ultimate Guitar (or add them by hand) once you're in Creator mode"}
          </span>
        </div>

        <button className="btn-primary" type="submit" disabled={isLoading || (mode === 'saved' && savedSongs.length === 0)}>
          {isLoading ? 'Loading…' : usingSaved ? 'Open saved song →' : 'Open in Creator →'}
        </button>

        {usingSaved && (
          <button
            type="button"
            className="btn-delete btn-delete-saved"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : '× Delete this saved song'}
          </button>
        )}
      </form>
    </div>
  )
}

// ─── Playalong mode ─────────────────────────────────────────────

// Stands in for the YouTube scrubber while the video is hidden — otherwise
// hiding it (to make room for the chord charts) would leave no way to jump
// around the song short of the 2-second ArrowLeft/ArrowRight nudge. The bar
// spans only the trimmed startOffset–endOffset range (the part Playalong
// actually plays), not the full video — the excluded intro/outro isn't
// shown at all, so there's nowhere on the bar to click or drag into it.
function PlaybackBar({ currentTime, duration, startOffset, endOffset, onSeek }: {
  currentTime: number
  duration: number
  startOffset?: number
  endOffset?: number
  onSeek: (time: number) => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const rangeStart = startOffset ?? 0
  const rangeEnd = endOffset ?? duration
  const rangeDuration = Math.max(0, rangeEnd - rangeStart)

  const timeFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el || rangeDuration <= 0) return rangeStart
    const rect = el.getBoundingClientRect()
    const ratio = rect.width > 0 ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0
    return rangeStart + ratio * rangeDuration
  }, [rangeStart, rangeDuration])

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onSeek(timeFromClientX(e.clientX))
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return
    onSeek(timeFromClientX(e.clientX))
  }
  function handlePointerUp() {
    setDragging(false)
  }

  const pct = rangeDuration > 0 ? Math.min(100, Math.max(0, ((currentTime - rangeStart) / rangeDuration) * 100)) : 0

  return (
    <div className="playback-bar">
      <div
        className="playback-bar-track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Click or drag to jump to a different part of the song"
      >
        <div className="playback-bar-fill" style={{ width: `${pct}%` }} />
        <div className="playback-bar-handle" style={{ left: `${pct}%` }} />
      </div>
      <div className="playback-bar-time">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(rangeEnd)}</span>
      </div>
    </div>
  )
}

function PlayalongView({
  videoId,
  timeline,
  sections,
  lyrics,
  chordDict,
  startOffset,
  endOffset,
  showNextChordPreview,
  onShowNextChordPreviewChange,
  showTiedLyrics,
  beatsPerMeasure,
  initialSeekTime,
  onToCreator,
  onReset,
}: {
  videoId: string
  timeline: ChordEntry[]
  sections: Section[]
  lyrics: string
  chordDict: ChordDictionary
  startOffset?: number
  endOffset?: number
  showNextChordPreview: boolean
  onShowNextChordPreviewChange: (value: boolean) => void
  // Whether to show lyrics on a tied section's active row — authored in
  // Creator (Timeline's tie-group popover), not toggled here.
  showTiedLyrics: boolean
  // Default beats-per-measure for chords with no `beats` of their own —
  // authored in Creator (Timeline's toolbar), not toggled here.
  beatsPerMeasure: number
  // Where the Creator's own timeline playhead sat when the user switched to
  // Playalong — carried over so playback picks up from the same spot
  // instead of resetting to the start. Mirrors initialSeekTime's Creator-
  // side counterpart in RecordingView.tsx, for the opposite direction.
  initialSeekTime?: number
  onToCreator: (time: number) => void
  onReset: () => void
}) {
  const [soundOn, setSoundOn] = useState(false)
  const [videoHidden, setVideoHidden] = useState(true)
  const [chordZoom, setChordZoom] = useState(() => loadZoom(CHORD_ZOOM_STORAGE_KEY))
  const [lyricsZoom, setLyricsZoom] = useState(() => loadZoom(LYRICS_ZOOM_STORAGE_KEY))
  useEffect(() => {
    localStorage.setItem(CHORD_ZOOM_STORAGE_KEY, String(chordZoom))
  }, [chordZoom])
  useEffect(() => {
    localStorage.setItem(LYRICS_ZOOM_STORAGE_KEY, String(lyricsZoom))
  }, [lyricsZoom])
  const chordZoomIn = useCallback(() => setChordZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100)), [])
  const chordZoomOut = useCallback(() => setChordZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100)), [])
  const lyricsZoomIn = useCallback(() => setLyricsZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100)), [])
  const lyricsZoomOut = useCallback(() => setLyricsZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100)), [])
  const yt = useYouTubePlayer(videoId)
  const { containerRef } = yt
  // A local audio file (e.g. a pitch-shifted copy of the video, prepared
  // outside UkeSync) takes over as the thing actually heard *and* the clock
  // chord sync/transport/recording all follow, in place of the video's own
  // audio and timeline — everything below that reads currentTime/duration/
  // isReady/isPlaying/seekTo/play/pause is written generically against
  // whichever source is active, so nothing else needs to know which one it
  // is. Not persisted — picked fresh each session via the file input below.
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const usingAudioFile = !!audioFile
  const audioFilePlayer = useAudioFilePlayer(audioFile)
  const currentTime = usingAudioFile ? audioFilePlayer.currentTime : yt.currentTime
  const duration = usingAudioFile ? audioFilePlayer.duration : yt.duration
  const isReady = usingAudioFile ? audioFilePlayer.isReady : yt.isReady
  const isPlaying = usingAudioFile ? audioFilePlayer.isPlaying : yt.isPlaying
  const seekTo = usingAudioFile ? audioFilePlayer.seekTo : yt.seekTo
  const play = usingAudioFile ? audioFilePlayer.play : yt.play
  const pause = usingAudioFile ? audioFilePlayer.pause : yt.pause
  // Read by the ArrowLeft/ArrowRight handler below instead of closing over
  // currentTime directly, so that handler's effect doesn't need to re-run
  // (removing and re-adding the window listener) on every animation frame
  // during playback.
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  // Applies the carried-over Creator playhead position exactly once, as
  // soon as the player can actually accept a seek — mirrors RecordingView's
  // own appliedInitialSeekRef for the opposite direction. Explicitly paused
  // right after, since YouTube's player has a habit of resuming playback on
  // its own once a seek lands, which would otherwise start the video
  // running the instant Playalong opens.
  const appliedInitialSeekRef = useRef(false)
  useEffect(() => {
    if (!isReady || appliedInitialSeekRef.current || initialSeekTime == null) return
    appliedInitialSeekRef.current = true
    seekTo(initialSeekTime)
    pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, initialSeekTime])
  const { playChord } = useChordAudio()
  // A local audio file's own audio should never play alongside the video's —
  // applied whenever usingAudioFile changes and whenever the player becomes
  // ready (covers picking a file before the player exists yet).
  useEffect(() => {
    if (!yt.isReady) return
    if (usingAudioFile) yt.mute(); else yt.unMute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingAudioFile, yt.isReady])
  const { state: recordingState, error: recordingError, downloadUrl: recordingUrl, start: startRecording, stop: stopRecording, reset: resetRecording } = useScreenRecorder()
  const recordRegionRef = useRef<HTMLDivElement | null>(null)
  // Starting the recorder doesn't touch playback itself — without this, the
  // user would have to manually rewind and hit Play right after granting the
  // share prompt, which is exactly the fiddly hand-off this is meant to
  // remove. Only fires once the browser actually granted the share (start()
  // returns false on a cancelled/denied prompt).
  const handleStartRecording = useCallback(async () => {
    const started = await startRecording(recordRegionRef.current)
    if (started) {
      seekTo(startOffset ?? 0)
      play()
    }
  }, [startRecording, seekTo, startOffset, play])

  // Count-in ticks are ordinary ChordEntry objects (tapped in Creator the
  // same way chords are) using a sentinel chord value — split them out here
  // so the section/chord-grouping hooks and card renderers below never see
  // one, and so a count-in tick sitting before a section's startTime can't
  // get silently dropped by the section's own time-window filtering.
  const chordTimeline = useMemo(() => timeline.filter(e => e.chord !== COUNT_IN_CHORD), [timeline])
  const countInEntries = useMemo(() => timeline.filter(e => e.chord === COUNT_IN_CHORD), [timeline])
  const { section, entries, activeIdx, nextSection, nextChord, activeChordEndTime, isLastChordActive, tieGroupSections } = useSectionChords(chordTimeline, sections, currentTime)

  // The section whose chords lead the song — count-in dots ride along with
  // it (and with ChordOverlay's first batch, in the no-sections case) so
  // they sit in front of the first chord card instead of replacing it.
  const firstSection = useMemo(
    () => sections.length ? [...sections].sort((a, b) => a.startTime - b.startTime)[0] : null,
    [sections]
  )

  const lyricsBlocks = useMemo(() => parseLyrics(lyrics), [lyrics])
  const lyricsBySection = useMemo(() => matchLyricsToSections(lyricsBlocks, sections), [lyricsBlocks, sections])
  // Reserves the lyrics block's space on every section once the song uses
  // lyrics at all, not just the ones with a matched block, so the chord
  // grid below always starts at the same y across the whole song.
  const hasLyrics = lyricsBySection.size > 0
  // The tallest lyrics block in the song — LyricsCarousel reserves this many
  // lines' worth of height on every section (not just its own actual line
  // count), so a section with fewer lines (down to zero) leaves blank space
  // below its text instead of shrinking the block and shifting the chord
  // grid up.
  const maxLyricsLines = useMemo(
    () => Math.max(1, ...Array.from(lyricsBySection.values()).map(block => block.split('\n').length)),
    [lyricsBySection]
  )
  const nextLyrics = nextSection ? lyricsBySection.get(nextSection) : undefined

  // Re-clamps forward whenever playback lands before the start offset —
  // covers the initial load, but also YouTube's native "replay" button and
  // manual rewinds, both of which reset currentTime without us knowing.
  useEffect(() => {
    if (!isReady || !startOffset) return
    if (currentTime < startOffset - 0.2) seekTo(startOffset)
  }, [isReady, currentTime, startOffset, seekTo])

  useEffect(() => {
    if (endOffset == null || !isPlaying) return
    if (currentTime >= endOffset) pause()
  }, [currentTime, endOffset, isPlaying, pause])

  // Auto-stops a running recording the moment music playback stops for any
  // reason — reaching the end, a manual pause, or YouTube buffering (a
  // loading spinner in the middle of the take makes it unusable anyway, so
  // there's no reason to keep rolling through one). "Armed" only once
  // isPlaying has actually been observed true during this recording, so the
  // brief window between clicking Record and playback actually kicking in
  // (seekTo + play() both take a moment) doesn't itself read as "stopped."
  const recordingArmedRef = useRef(false)
  useEffect(() => {
    if (recordingState !== 'recording') {
      recordingArmedRef.current = false
      return
    }
    if (isPlaying) {
      recordingArmedRef.current = true
      return
    }
    if (recordingArmedRef.current) {
      recordingArmedRef.current = false
      stopRecording()
    }
  }, [recordingState, isPlaying, stopRecording])

  const playPauseRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        playPauseRef.current?.focus()
        if (isPlaying) pause(); else play()
        return
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, currentTimeRef.current - 2)); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(Math.min(duration, currentTimeRef.current + 2)); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, play, pause, seekTo, duration])

  const handlePulse = useCallback((chord: string) => {
    if (!soundOn) return
    const data = chordDict[chord]
    if (data) playChord(data.frets)
  }, [soundOn, chordDict, playChord])

  const videoClass = `yt-wrapper yt-wrapper-fixed${videoHidden ? ' yt-wrapper-hidden' : ''}`

  return (
    <div className="player-screen">
      <header className="app-header app-header-compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>UkeSync</h1>
          <span className="mode-badge mode-badge-playalong">Playalong</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn-ghost${videoHidden ? ' btn-ghost-active' : ''}`}
            onClick={() => setVideoHidden(v => !v)}
            title={videoHidden ? 'Show video' : 'Hide video to make room for chords'}
          >
            {videoHidden ? '📺 Show video' : '🙈 Hide video'}
          </button>
          {usingAudioFile ? (
            <span
              className="audio-file-control"
              title="Playing this file instead of the video's own audio — it now drives playback, chord sync and recording."
            >
              🎵 <span className="audio-file-name" title={audioFile.name}>{truncateFileName(audioFile.name)}</span>
              <button
                className="btn-ghost btn-small"
                onClick={() => setAudioFile(null)}
                title="Stop using this file — go back to the video's own audio"
              >
                ✕
              </button>
            </span>
          ) : (
            <label
              className="btn-ghost"
              title="Play a local audio file instead of the video's own sound — e.g. a pitch-shifted copy of the video prepared elsewhere. Also mutes the video, and drives chord sync, transport and recording."
            >
              🎵 Audio file
              <input
                type="file"
                accept="audio/*"
                onChange={e => setAudioFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </label>
          )}
          <button
            ref={playPauseRef}
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
          <button
            className={`btn-ghost${soundOn ? ' btn-ghost-active' : ''}`}
            onClick={() => setSoundOn(v => !v)}
            title={soundOn ? 'Mute chord sound' : 'Play chord on each beat'}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <div className="zoom-controls" title="Zoom the chord charts">
            <span className="zoom-label">🎸</span>
            <button className="btn-ghost zoom-btn" onClick={chordZoomOut} disabled={chordZoom <= ZOOM_MIN} title="Zoom chords out">－</button>
            <span className="zoom-level">{Math.round(chordZoom * 100)}%</span>
            <button className="btn-ghost zoom-btn" onClick={chordZoomIn} disabled={chordZoom >= ZOOM_MAX} title="Zoom chords in">＋</button>
          </div>
          <div className="zoom-controls" title="Zoom the lyrics">
            <span className="zoom-label">📝</span>
            <button className="btn-ghost zoom-btn" onClick={lyricsZoomOut} disabled={lyricsZoom <= ZOOM_MIN} title="Zoom lyrics out">－</button>
            <span className="zoom-level">{Math.round(lyricsZoom * 100)}%</span>
            <button className="btn-ghost zoom-btn" onClick={lyricsZoomIn} disabled={lyricsZoom >= ZOOM_MAX} title="Zoom lyrics in">＋</button>
          </div>
          <button
            className={`btn-ghost${showNextChordPreview ? ' btn-ghost-active' : ''}`}
            onClick={() => onShowNextChordPreviewChange(!showNextChordPreview)}
            title={showNextChordPreview ? 'Hide the blinking next-chord preview' : 'Show the blinking next-chord preview'}
          >
            {showNextChordPreview ? '👁 Next chord' : '🙈 Next chord'}
          </button>
          <div className="record-controls">
            {recordingState === 'idle' && (
              <button
                className="btn-record"
                onClick={handleStartRecording}
                title='Record this screen as a video — pick "This Tab" and enable "Share tab audio" when your browser asks. Playback starts automatically once sharing begins.'
              >
                ⏺ Record
              </button>
            )}
            {recordingState === 'recording' && (
              <>
                {/* Elapsed time is just currentTime relative to where the take
                    started — recording always tracks playback 1:1 (see the
                    auto-start-on-record and auto-stop-on-pause effects above),
                    so there's no separate clock to keep in sync. */}
                <span className="rec-readout">
                  <span className="rec-dot" aria-hidden="true" />{' '}
                  REC <span className="rec-readout-time">{formatTime(Math.max(0, currentTime - (startOffset ?? 0)))}</span>
                </span>
                <button
                  className="btn-record"
                  onClick={stopRecording}
                  title="Stop recording — this also happens automatically once the song ends"
                >
                  ⏹ Stop
                </button>
              </>
            )}
            {recordingState === 'stopped' && recordingUrl && (
              <>
                <a className="btn-save" href={recordingUrl} download="ukesync-playalong.webm">⬇ Save video</a>
                <button className="btn-discard" onClick={resetRecording} title="Discard and record again">✕</button>
              </>
            )}
            {recordingError && <span className="record-error">{recordingError}</span>}
          </div>
          <button className="btn-ghost" onClick={() => onToCreator(currentTime)}>← Creator</button>
          <button className="btn-ghost" onClick={onReset}>New song</button>
        </div>
      </header>

      <div className="player-layout" ref={recordRegionRef}>
        <div className="player-left">
          <div className={videoClass}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {!isReady && <div className="yt-loading">Loading player…</div>}
          </div>
          {/* Not visual — just the actual playback engine while a local
              audio file is active. Always mounted (rather than only once a
              file is picked) so useAudioFilePlayer has a real element to
              attach the object URL to the moment one is. */}
          <audio ref={audioFilePlayer.audioRef} />
          {videoHidden && isReady && (
            <PlaybackBar currentTime={currentTime} duration={duration} startOffset={startOffset} endOffset={endOffset} onSeek={seekTo} />
          )}
          {section ? (
            tieGroupSections.length > 1 ? (
              <TiedSectionsBoard
                members={tieGroupSections}
                activeSection={section}
                chordDict={chordDict}
                chordZoom={chordZoom}
                onSeek={seekTo}
                hasLyrics={hasLyrics}
                activeBoard={
                  <SectionChordBoard
                    section={section}
                    entries={entries}
                    activeIdx={activeIdx}
                    nextChord={nextChord}
                    activeChordEndTime={activeChordEndTime}
                    currentTime={currentTime}
                    chordDict={chordDict}
                    onPulse={handlePulse}
                    showNextPreview={showNextChordPreview}
                    isLastChordActive={isLastChordActive}
                    countInEntries={countInEntries}
                    isFirstSection={section === firstSection}
                    lyrics={showTiedLyrics ? lyricsBySection.get(section) : undefined}
                    nextLyrics={showTiedLyrics ? nextLyrics : undefined}
                    hasLyrics={hasLyrics && showTiedLyrics}
                    maxLyricsLines={maxLyricsLines}
                    chordZoom={chordZoom}
                    lyricsZoom={lyricsZoom}
                    beatsPerMeasure={beatsPerMeasure}
                  />
                }
              />
            ) : (
              <SectionChordBoard
                section={section}
                entries={entries}
                activeIdx={activeIdx}
                nextChord={nextChord}
                activeChordEndTime={activeChordEndTime}
                currentTime={currentTime}
                chordDict={chordDict}
                onPulse={handlePulse}
                showNextPreview={showNextChordPreview}
                isLastChordActive={isLastChordActive}
                countInEntries={countInEntries}
                isFirstSection={section === firstSection}
                lyrics={lyricsBySection.get(section)}
                nextLyrics={nextLyrics}
                hasLyrics={hasLyrics}
                maxLyricsLines={maxLyricsLines}
                chordZoom={chordZoom}
                lyricsZoom={lyricsZoom}
                beatsPerMeasure={beatsPerMeasure}
              />
            )
          ) : (
            <ChordOverlay
              timeline={chordTimeline}
              currentTime={currentTime}
              chordDict={chordDict}
              onPulse={handlePulse}
              showNextPreview={showNextChordPreview}
              countInEntries={countInEntries}
              chordZoom={chordZoom}
              beatsPerMeasure={beatsPerMeasure}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState] = useState<AppState>('input')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [chords, setChords] = useState<string[]>([])
  const [timeline, setTimeline] = useState<ChordEntry[]>([])
  const [chordDict, setChordDict] = useState<ChordDictionary>({})
  const [creatorSnapshot, setCreatorSnapshot] = useState<CreatorSnapshot | null>(null)
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([])
  // Where Creator's video should seek to on mount — set when coming back
  // from Playalong mid-song, so the timeline playhead (which just mirrors
  // the video's current time) picks up right where playback was left off
  // instead of resetting to the start.
  const [creatorSeekTime, setCreatorSeekTime] = useState<number | undefined>(undefined)
  // The reverse of creatorSeekTime — where Creator's own timeline playhead
  // sat when the user switched to Playalong, so playback picks up from that
  // same spot instead of resetting to the start.
  const [playalongSeekTime, setPlayalongSeekTime] = useState<number | undefined>(undefined)

  const refreshSavedSongs = useCallback(() => {
    fetch(`${API}/songs`)
      .then(r => r.json())
      .then(setSavedSongs)
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API}/chords`)
      .then(r => r.json())
      .then(setChordDict)
      .catch(() => {})
    refreshSavedSongs()
  }, [refreshSavedSongs])

  async function handleStart(url: string, songChords: string[]) {
    const vid = extractVideoId(url)
    if (!vid) { setError('Could not extract video ID from URL'); return }
    setError(null)
    setIsLoading(true)
    setCreatorSeekTime(undefined)
    let snapshot: CreatorSnapshot | undefined
    try {
      const res = await fetch(`${API}/songs/${vid}`)
      if (res.ok) {
        const saved = await res.json()
        if (saved.snapshot) {
          snapshot = saved.snapshot
          setCreatorSnapshot(saved.snapshot)
        }
      }
    } catch {
      // proceed without saved data
    }
    setVideoId(vid)
    setChords(songChords)
    // A locked song's chord chart is considered finished — skip straight to
    // Playalong instead of making the user click through Creator each time.
    if (snapshot?.locked) {
      setTimeline(snapshot.timeline)
      setAppState('playalong')
    } else {
      setAppState('creator')
    }
    setIsLoading(false)
  }

  // The global dictionary with this song's per-chord string-mute edits (see
  // RecordingView's chordOverrides) layered on top. Only Playalong needs
  // this merged version — Creator gets the raw chordDict prop and computes
  // its own equivalent live (RecordingView's effectiveChordDict), since
  // chordOverrides itself lives in Creator's own in-progress state until a
  // save round-trips it back into creatorSnapshot here.
  const effectiveChordDict = useMemo(() => {
    const overrides = creatorSnapshot?.chordOverrides
    if (!overrides || Object.keys(overrides).length === 0) return chordDict
    return { ...chordDict, ...overrides }
  }, [chordDict, creatorSnapshot?.chordOverrides])

  const deleteSavedSong = useCallback(async (vid: string) => {
    await fetch(`${API}/songs/${vid}`, { method: 'DELETE' }).catch(() => {})
    refreshSavedSongs()
  }, [refreshSavedSongs])

  const saveSnapshot = useCallback((snapshot: CreatorSnapshot) => {
    if (!videoId) return
    fetch(`${API}/songs/${videoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, chords }),
    }).catch(() => {})
  }, [videoId, chords])

  function handleCreatorDone(taps: ChordEntry[], snapshot: CreatorSnapshot, seekTime: number) {
    setTimeline(taps)
    setCreatorSnapshot(snapshot)
    setAppState('playalong')
    setCreatorSeekTime(undefined)
    setPlayalongSeekTime(seekTime)
    saveSnapshot(snapshot)
  }

  const setShowNextChordPreview = useCallback((value: boolean) => {
    setCreatorSnapshot(prev => {
      const next: CreatorSnapshot = { timeline, ...prev, showNextChordPreview: value }
      saveSnapshot(next)
      return next
    })
  }, [saveSnapshot, timeline])

  function handleReset() {
    setAppState('input')
    setVideoId(null)
    setChords([])
    setTimeline([])
    setCreatorSnapshot(null)
    setCreatorSeekTime(undefined)
    setPlayalongSeekTime(undefined)
    setError(null)
    refreshSavedSongs()
  }

  if (appState === 'creator' && videoId) {
    return (
      <RecordingView
        videoId={videoId}
        chords={chords}
        chordDict={chordDict}
        initialSnapshot={creatorSnapshot ?? undefined}
        initialSeekTime={creatorSeekTime}
        onDone={handleCreatorDone}
        onSnapshotChange={saveSnapshot}
        onChordsChange={setChords}
        onBack={handleReset}
      />
    )
  }

  if (appState === 'playalong' && videoId) {
    return (
      <PlayalongView
        videoId={videoId}
        timeline={timeline}
        sections={creatorSnapshot?.sections ?? []}
        lyrics={creatorSnapshot?.lyrics ?? ''}
        chordDict={effectiveChordDict}
        startOffset={creatorSnapshot?.startOffset}
        endOffset={creatorSnapshot?.endOffset}
        showNextChordPreview={creatorSnapshot?.showNextChordPreview ?? true}
        onShowNextChordPreviewChange={setShowNextChordPreview}
        showTiedLyrics={creatorSnapshot?.showTiedLyrics ?? false}
        beatsPerMeasure={creatorSnapshot?.beatsPerMeasure ?? 4}
        initialSeekTime={playalongSeekTime}
        onToCreator={time => { setCreatorSeekTime(time); setAppState('creator') }}
        onReset={handleReset}
      />
    )
  }

  return (
    <>
      <InputForm onStart={handleStart} isLoading={isLoading} savedSongs={savedSongs} onDeleteSaved={deleteSavedSong} />
      {error && <div className="error-banner">{error}</div>}
    </>
  )
}
