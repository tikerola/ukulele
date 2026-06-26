import { useId, useState, useEffect, useCallback } from 'react'
import type { ChordDictionary, ChordEntry, AppState, CreatorSnapshot } from './types'
import { ChordOverlay } from './components/ChordOverlay'
import { RecordingView } from './components/RecordingView'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { useChordAudio } from './hooks/useChordAudio'

const API = '/api'

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function parseChords(input: string): string[] {
  return input.split(/\s+/).filter(s => s.length > 0)
}

// ─── Home screen ────────────────────────────────────────────────

function InputForm({ onStart, isLoading }: { onStart: (url: string, chords: string[]) => void; isLoading?: boolean }) {
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=ONdsLfVZMso')
  const [chordText, setChordText] = useState('Am G Dm')
  const urlId = useId()
  const chordsId = useId()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const chords = parseChords(chordText)
    if (!url.trim() || chords.length === 0) return
    onStart(url.trim(), chords)
  }

  return (
    <div className="input-screen">
      <header className="app-header">
        <h1>UkeSync</h1>
        <p className="tagline">Ukulele playalong from YouTube — create once, play forever</p>
      </header>
      <form className="input-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={urlId}>YouTube URL</label>
          <input
            id={urlId}
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor={chordsId}>Chords in this song</label>
          <textarea
            id={chordsId}
            rows={3}
            placeholder="C Em G F Am"
            value={chordText}
            onChange={e => setChordText(e.target.value)}
          />
          <span className="field-hint">
            List every unique chord — you'll assign them to beats in Creator mode
          </span>
        </div>

        <button className="btn-primary" type="submit" disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Open in Creator →'}
        </button>
      </form>
    </div>
  )
}

// ─── Playalong mode ─────────────────────────────────────────────

function PlayalongView({
  videoId,
  chords,
  timeline,
  chordDict,
  bpm,
  meter,
  strumPattern,
  beatPhaseTime,
  onToCreator,
  onReset,
}: {
  videoId: string
  chords: string[]
  timeline: ChordEntry[]
  chordDict: ChordDictionary
  bpm: number
  meter: number
  strumPattern: boolean[]
  beatPhaseTime: number
  onToCreator: () => void
  onReset: () => void
}) {
  const [soundOn, setSoundOn] = useState(false)
  const { containerRef, currentTime, isReady } = useYouTubePlayer(videoId)
  const { playChord } = useChordAudio()

  const handlePulse = useCallback((chord: string) => {
    if (!soundOn) return
    const data = chordDict[chord]
    if (data) playChord(data.frets)
  }, [soundOn, chordDict, playChord])

  return (
    <div className="player-screen">
      <header className="app-header app-header-compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>UkeSync</h1>
          <span className="mode-badge mode-badge-playalong">Playalong</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn-ghost${soundOn ? ' btn-ghost-active' : ''}`}
            onClick={() => setSoundOn(v => !v)}
            title={soundOn ? 'Mute chord sound' : 'Play chord on each beat'}
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn-ghost" onClick={onToCreator}>← Creator</button>
          <button className="btn-ghost" onClick={onReset}>New song</button>
        </div>
      </header>

      <div className="player-layout">
        <div className="player-left">
          <div className="yt-wrapper">
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {!isReady && <div className="yt-loading">Loading player…</div>}
          </div>
          <ChordOverlay
            chords={chords}
            timeline={timeline}
            currentTime={currentTime}
            chordDict={chordDict}
            bpm={bpm}
            beatsPerBar={meter}
            strumPattern={strumPattern}
            onPulse={handlePulse}
            beatPhaseTime={beatPhaseTime}
          />
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
  const [bpm, setBpm] = useState<number>(0)
  const [meter, setMeter] = useState<number>(4)
  const [strumPattern, setStrumPattern] = useState<boolean[]>([true, true, true, true])
  const [timeline, setTimeline] = useState<ChordEntry[]>([])
  const [chordDict, setChordDict] = useState<ChordDictionary>({})
  const [creatorSnapshot, setCreatorSnapshot] = useState<CreatorSnapshot | null>(null)

  useEffect(() => {
    fetch(`${API}/chords`)
      .then(r => r.json())
      .then(setChordDict)
      .catch(() => {})
  }, [])

  async function handleStart(url: string, songChords: string[]) {
    const vid = extractVideoId(url)
    if (!vid) { setError('Could not extract video ID from URL'); return }
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch(`${API}/songs/${vid}`)
      if (res.ok) {
        const saved = await res.json()
        if (saved.snapshot) setCreatorSnapshot(saved.snapshot)
      }
    } catch {
      // proceed without saved data
    }
    setVideoId(vid)
    setChords(songChords)
    setAppState('creator')
    setIsLoading(false)
  }

  function handleCreatorDone(taps: ChordEntry[], detectedBpm: number | null, detectedMeter: number, detectedStrumPattern: boolean[], snapshot: CreatorSnapshot) {
    setTimeline(taps)
    setBpm(detectedBpm ?? 0)
    setMeter(detectedMeter)
    setStrumPattern(detectedStrumPattern)
    setCreatorSnapshot(snapshot)
    setAppState('playalong')
    if (videoId) {
      fetch(`${API}/songs/${videoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, chords }),
      }).catch(() => {})
    }
  }

  function handleReset() {
    setAppState('input')
    setVideoId(null)
    setChords([])
    setTimeline([])
    setCreatorSnapshot(null)
    setError(null)
  }

  if (appState === 'creator' && videoId) {
    return (
      <RecordingView
        videoId={videoId}
        chords={chords}
        chordDict={chordDict}
        initialSnapshot={creatorSnapshot ?? undefined}
        onDone={handleCreatorDone}
        onBack={handleReset}
      />
    )
  }

  if (appState === 'playalong' && videoId) {
    const snap = creatorSnapshot
    const beat0Offset = snap
      ? (snap.syncAnchors.find(a => a.barStart === 0)?.offset ?? snap.audioOffset)
      : 0
    const beatPhaseTime = (snap?.beats[0] ?? 0) + beat0Offset

    return (
      <PlayalongView
        videoId={videoId}
        chords={chords}
        timeline={timeline}
        chordDict={chordDict}
        bpm={bpm}
        meter={meter}
        strumPattern={strumPattern}
        beatPhaseTime={beatPhaseTime}
        onToCreator={() => setAppState('creator')}
        onReset={handleReset}
      />
    )
  }

  return (
    <>
      <InputForm onStart={handleStart} isLoading={isLoading} />
      {error && <div className="error-banner">{error}</div>}
    </>
  )
}
