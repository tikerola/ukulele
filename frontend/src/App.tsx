import { useId, useState, useEffect } from 'react'
import type { ChordDictionary, ChordEntry, AppState } from './types'
import { ChordOverlay } from './components/ChordOverlay'
import { ChordEditor } from './components/ChordEditor'
import { RecordingView } from './components/RecordingView'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'

const API = '/api'

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function parseChords(input: string): string[] {
  return input.split(/\s+/).filter(s => s.length > 0)
}

function InputForm({ onStart }: { onStart: (url: string, chords: string[]) => void }) {
  const [url, setUrl] = useState('')
  const [chordText, setChordText] = useState('C Em G F')
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
        <p className="tagline">Tap-to-sync ukulele playalong from YouTube</p>
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
            placeholder="C Em G F"
            value={chordText}
            onChange={e => setChordText(e.target.value)}
          />
          <span className="field-hint">List every unique chord — you'll tap them in time with the video</span>
        </div>

        <button className="btn-primary" type="submit">
          Load Video
        </button>
      </form>
    </div>
  )
}

function PlayerView({
  videoId,
  timeline,
  chordDict,
  bpm,
  onReRecord,
  onReset,
}: {
  videoId: string
  timeline: ChordEntry[]
  chordDict: ChordDictionary
  bpm: number
  onReRecord: () => void
  onReset: () => void
}) {
  const [editableTimeline, setEditableTimeline] = useState<ChordEntry[]>(timeline)
  const { containerRef, currentTime, isReady } = useYouTubePlayer(videoId)

  return (
    <div className="player-screen">
      <header className="app-header app-header-compact">
        <h1>UkeSync</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={onReRecord}>Re-record</button>
          <button className="btn-ghost" onClick={onReset}>← New Song</button>
        </div>
      </header>

      <div className="player-layout">
        <div className="player-left">
          <div className="yt-wrapper">
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            {!isReady && <div className="yt-loading">Loading player…</div>}
          </div>
          <ChordOverlay
            timeline={editableTimeline}
            currentTime={currentTime}
            chordDict={chordDict}
            bpm={bpm}
          />
        </div>
        <div className="player-right">
          <ChordEditor
            timeline={editableTimeline}
            currentTime={currentTime}
            onChange={setEditableTimeline}
          />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('input')
  const [error, setError] = useState<string | null>(null)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [chords, setChords] = useState<string[]>([])
  const [bpm, setBpm] = useState<number>(0)
  const [timeline, setTimeline] = useState<ChordEntry[]>([])
  const [chordDict, setChordDict] = useState<ChordDictionary>({})

  useEffect(() => {
    fetch(`${API}/chords`)
      .then(r => r.json())
      .then(setChordDict)
      .catch(() => {})
  }, [])

  function handleStart(url: string, songChords: string[]) {
    const vid = extractVideoId(url)
    if (!vid) { setError('Could not extract video ID from URL'); return }
    setError(null)
    setVideoId(vid)
    setChords(songChords)
    setAppState('recording')
  }

  function handleRecordingDone(taps: ChordEntry[], detectedBpm: number | null) {
    setTimeline(taps)
    setBpm(detectedBpm ?? 0)
    setAppState('editing')
  }

  function handleReset() {
    setAppState('input')
    setVideoId(null)
    setChords([])
    setTimeline([])
    setError(null)
  }

  if (appState === 'recording' && videoId) {
    return (
      <RecordingView
        videoId={videoId}
        chords={chords}
        chordDict={chordDict}
        onDone={handleRecordingDone}
        onBack={handleReset}
      />
    )
  }

  if (appState === 'editing' && videoId) {
    return (
      <PlayerView
        videoId={videoId}
        timeline={timeline}
        chordDict={chordDict}
        bpm={bpm}
        onReRecord={() => setAppState('recording')}
        onReset={handleReset}
      />
    )
  }

  return (
    <>
      <InputForm onStart={handleStart} />
      {error && <div className="error-banner">{error}</div>}
    </>
  )
}
