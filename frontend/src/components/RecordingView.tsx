import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import type { ChordEntry, ChordDictionary } from '../types'

interface Props {
  videoId: string
  chords: string[]
  chordDict: ChordDictionary
  onDone: (timeline: ChordEntry[], bpm: number | null) => void
  onBack: () => void
}

export function RecordingView({ videoId, chords, chordDict, onDone, onBack }: Props) {
  // Hook runs unconditionally — container div is always mounted in the DOM
  const { containerRef, currentTime, isReady, isPlaying } = useYouTubePlayer(videoId)

  const [beats, setBeats] = useState<number[]>([])
  const [bpm, setBpm] = useState(0)
  const [slots, setSlots] = useState<Record<number, string>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedBeat, setSelectedBeat] = useState<number | null>(null)
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const lastScrolledBarRef = useRef<number>(-1)

  useEffect(() => {
    fetch('/api/beats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: `https://www.youtube.com/watch?v=${videoId}` }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => Promise.reject(d.detail ?? `HTTP ${r.status}`))
        return r.json()
      })
      .then(data => {
        setBeats(data.beats)
        setBpm(data.bpm)
        setStatus('ready')
        if (data.beats.length > 0) setSelectedBeat(0)
      })
      .catch(err => {
        setErrorMsg(typeof err === 'string' ? err : 'Beat analysis failed')
        setStatus('error')
      })
  }, [videoId])

  const currentBeatIdx = useMemo(() => {
    let idx = -1
    for (let i = 0; i < beats.length; i++) {
      if (beats[i] <= currentTime) idx = i
      else break
    }
    return idx
  }, [beats, currentTime])

  const targetBeatIdx = isPlaying ? currentBeatIdx : (selectedBeat ?? currentBeatIdx)

  const currentBarIdx = Math.floor(Math.max(currentBeatIdx, 0) / 4)
  useEffect(() => {
    if (currentBarIdx !== lastScrolledBarRef.current && activeSlotRef.current) {
      lastScrolledBarRef.current = currentBarIdx
      activeSlotRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentBarIdx])

  const assignChord = useCallback((chord: string) => {
    const idx = targetBeatIdx
    if (idx < 0) return
    setSlots(prev => ({ ...prev, [idx]: chord }))
    if (!isPlaying) {
      const next = idx + 1
      setSelectedBeat(next < beats.length ? next : idx)
    }
  }, [targetBeatIdx, isPlaying, beats.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const i = parseInt(e.key) - 1
      if (i >= 0 && i < chords.length) assignChord(chords[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chords, assignChord])

  const bars = useMemo(() => {
    const result: number[][] = []
    for (let i = 0; i < beats.length; i += 4) {
      const row: number[] = []
      for (let j = 0; j < 4 && i + j < beats.length; j++) row.push(i + j)
      result.push(row)
    }
    return result
  }, [beats])

  function buildTimeline(): ChordEntry[] {
    return Object.entries(slots)
      .map(([idx, chord]) => ({ time: beats[parseInt(idx)], chord }))
      .sort((a, b) => a.time - b.time)
  }

  function undoLast() {
    const keys = Object.keys(slots).map(Number)
    if (keys.length === 0) return
    const last = Math.max(...keys)
    setSlots(prev => { const n = { ...prev }; delete n[last]; return n })
  }

  function getChordData(chord: string) {
    if (chordDict[chord]) return chordDict[chord]
    const lower = chord.toLowerCase()
    for (const key of Object.keys(chordDict)) {
      if (key.toLowerCase() === lower) return chordDict[key]
    }
    return null
  }

  const assignedCount = Object.keys(slots).length

  return (
    <div className="recording-screen">
      <header className="app-header app-header-compact">
        <h1>UkeSync</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status === 'ready' && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {Math.round(bpm)} BPM · {beats.length} beats
            </span>
          )}
          <button className="btn-ghost" onClick={onBack}>← Back</button>
        </div>
      </header>

      {/*
        Main content area: video + beat grid on top, chord buttons on bottom.
        The video+grid area gets an overlay during loading/error.
        Chord buttons are OUTSIDE that overlay so they're always visible.
      */}
      <div className="recording-body">

        {/* ── Top area: video + beat grid (with overlay) ── */}
        <div className="recording-top" style={{ position: 'relative' }}>

          {/* Video column — always in DOM so YouTube player initialises */}
          <div className="recording-video-col">
            <div className="yt-wrapper">
              <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
              {!isReady && status === 'ready' && (
                <div className="yt-loading">Loading player…</div>
              )}
            </div>
          </div>

          {/* Beat grid column */}
          <div className="recording-grid-col">
            {status === 'ready' ? (
              <>
                <div className="tap-log-header">
                  <span>
                    Beat Grid{' '}
                    <span className="chord-count">({assignedCount} of {beats.length})</span>
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-small" onClick={undoLast} disabled={assignedCount === 0}>Undo</button>
                    <button className="btn-small" onClick={() => setSlots({})} disabled={assignedCount === 0}>Clear</button>
                  </div>
                </div>

                <div className="beat-grid-scroll">
                  {bars.map((beatIndices, barIdx) => (
                    <div key={barIdx} className="beat-row">
                      <span className="bar-number">{barIdx + 1}</span>
                      {beatIndices.map(beatIdx => {
                        const isCurrent = beatIdx === currentBeatIdx
                        const isTarget = !isPlaying && beatIdx === targetBeatIdx
                        const chord = slots[beatIdx]
                        let cls = 'beat-slot'
                        if (isCurrent) cls += ' beat-slot-current'
                        if (isTarget) cls += ' beat-slot-target'
                        if (chord) cls += ' beat-slot-filled'
                        return (
                          <div
                            key={beatIdx}
                            ref={isCurrent ? activeSlotRef : undefined}
                            className={cls}
                            title={chord ? 'Click to clear' : 'Click to select'}
                            onClick={() => {
                              if (chord) {
                                setSlots(prev => { const n = { ...prev }; delete n[beatIdx]; return n })
                              } else {
                                setSelectedBeat(beatIdx)
                              }
                            }}
                          >
                            {chord || ''}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                <div className="tap-footer">
                  <button
                    className="btn-primary"
                    onClick={() => onDone(buildTimeline(), bpm)}
                    disabled={assignedCount === 0}
                  >
                    Done →
                  </button>
                </div>
              </>
            ) : (
              /* Loading / error state in the grid column */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
                {status === 'loading' && (
                  <>
                    <div className="spinner" />
                    <div style={{ fontWeight: 600 }}>Analyzing beats…</div>
                    <div className="loading-hint" style={{ textAlign: 'center' }}>
                      Downloading audio and detecting beat positions.<br />This takes 30–60 seconds.
                    </div>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <div style={{ color: 'var(--danger)', fontWeight: 600 }}>Beat analysis failed</div>
                    {errorMsg && (
                      <div className="loading-hint" style={{ maxWidth: 320, textAlign: 'center', wordBreak: 'break-word' }}>
                        {errorMsg}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Chord buttons — always visible regardless of loading state ── */}
        <div className="tap-strip">
          <div className="tap-instructions">
            {status === 'ready'
              ? isPlaying
                ? <>Click a chord to assign it to the current beat · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
                : <>Paused — select a beat slot, then click a chord · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
              : <>Beats loading — chord charts available for reference · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
            }
          </div>
          <div className="chord-buttons">
            {chords.map((chord, i) => (
              <button
                key={chord}
                className="chord-tap-btn"
                onClick={() => assignChord(chord)}
                disabled={status !== 'ready'}
                style={status !== 'ready' ? { opacity: 0.6, cursor: 'default' } : undefined}
              >
                <span className="chord-tap-key">{i + 1}</span>
                <span className="chord-tap-name">{chord}</span>
                <ChordDiagram chord={chord} data={getChordData(chord)} size={0.85} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
