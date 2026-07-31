import { useId, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ChordDictionary, ChordEntry, AppState, CreatorSnapshot, Section, SavedSong } from './types'
import { ChordOverlay } from './components/ChordOverlay'
import { SectionChordBoard } from './components/SectionChordBoard'
import { RecordingView } from './components/RecordingView'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { useChordAudio } from './hooks/useChordAudio'
import { useSectionChords } from './hooks/useChordSync'
import { COUNT_IN_CHORD } from './lib/countIn'
import { parseLyrics } from './lib/parseLyrics'
import { matchLyricsToSections } from './lib/matchLyricsToSections'

const API = '/api'

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
    if (!url.trim() || chords.length === 0) return

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
          <label htmlFor={chordsId}>Chords in this song</label>
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
              : "List every unique chord — you'll record them onto the timeline in Creator mode"}
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
  onToCreator: () => void
  onReset: () => void
}) {
  const [soundOn, setSoundOn] = useState(false)
  const [videoHidden, setVideoHidden] = useState(true)
  const { containerRef, currentTime, isReady, isPlaying, seekTo, play, pause } = useYouTubePlayer(videoId)
  const { playChord } = useChordAudio()

  // Count-in ticks are ordinary ChordEntry objects (tapped in Creator the
  // same way chords are) using a sentinel chord value — split them out here
  // so the section/chord-grouping hooks and card renderers below never see
  // one, and so a count-in tick sitting before a section's startTime can't
  // get silently dropped by the section's own time-window filtering.
  const chordTimeline = useMemo(() => timeline.filter(e => e.chord !== COUNT_IN_CHORD), [timeline])
  const countInEntries = useMemo(() => timeline.filter(e => e.chord === COUNT_IN_CHORD), [timeline])
  const { section, entries, activeIdx, nextSection, nextChord, activeChordEndTime, isLastChordActive } = useSectionChords(chordTimeline, sections, currentTime)

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
  // grid below always starts at the same y across the whole song — not
  // only between a section's own 1-line vs 2-line lyrics.
  const hasLyrics = lyricsBySection.size > 0

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

  const playPauseRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code !== 'Space') return
      e.preventDefault()
      playPauseRef.current?.focus()
      if (isPlaying) pause(); else play()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isPlaying, play, pause])

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
          <button
            className={`btn-ghost${showNextChordPreview ? ' btn-ghost-active' : ''}`}
            onClick={() => onShowNextChordPreviewChange(!showNextChordPreview)}
            title={showNextChordPreview ? 'Hide the blinking next-chord preview' : 'Show the blinking next-chord preview'}
          >
            {showNextChordPreview ? '👁 Next chord' : '🙈 Next chord'}
          </button>
          <button className="btn-ghost" onClick={onToCreator}>← Creator</button>
          <button className="btn-ghost" onClick={onReset}>New song</button>
        </div>
      </header>

      <div className="player-layout">
        <div className="player-left">
          <div className={videoClass}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {!isReady && <div className="yt-loading">Loading player…</div>}
          </div>
          {section ? (
            <SectionChordBoard
              section={section}
              entries={entries}
              activeIdx={activeIdx}
              nextSection={nextSection}
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
              hasLyrics={hasLyrics}
            />
          ) : (
            <ChordOverlay
              timeline={chordTimeline}
              currentTime={currentTime}
              chordDict={chordDict}
              onPulse={handlePulse}
              showNextPreview={showNextChordPreview}
              countInEntries={countInEntries}
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

  function handleCreatorDone(taps: ChordEntry[], snapshot: CreatorSnapshot) {
    setTimeline(taps)
    setCreatorSnapshot(snapshot)
    setAppState('playalong')
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
        onDone={handleCreatorDone}
        onSnapshotChange={saveSnapshot}
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
        chordDict={chordDict}
        startOffset={creatorSnapshot?.startOffset}
        endOffset={creatorSnapshot?.endOffset}
        showNextChordPreview={creatorSnapshot?.showNextChordPreview ?? true}
        onShowNextChordPreviewChange={setShowNextChordPreview}
        onToCreator={() => setAppState('creator')}
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
