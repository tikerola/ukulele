import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useChordAudio } from '../hooks/useChordAudio'
import type { ChordEntry, ChordDictionary, CreatorSnapshot, SyncAnchor, SectionType, Section } from '../types'

const SECTION_BORDER_COLORS: Record<string, string> = {
  intro: 'rgba(63, 185, 80, 0.45)',
  verse: 'rgba(88, 166, 255, 0.45)',
  chorus: 'rgba(255, 215, 0, 0.45)',
  'pre-chorus': 'rgba(163, 113, 247, 0.45)',
  bridge: 'rgba(240, 136, 62, 0.45)',
  instrumental: 'rgba(125, 133, 144, 0.45)',
}

function effectiveOffset(beatIdx: number, meter: number, anchors: SyncAnchor[], fallback: number): number {
  const barIdx = Math.floor(beatIdx / meter)
  let offset = fallback
  for (const a of anchors) {
    if (a.barStart <= barIdx) offset = a.offset
    else break
  }
  return offset
}

interface Props {
  videoId: string
  chords: string[]
  chordDict: ChordDictionary
  initialSnapshot?: CreatorSnapshot
  onDone: (timeline: ChordEntry[], bpm: number | null, meter: number, strumPattern: boolean[], snapshot: CreatorSnapshot) => void
  onBack: () => void
}

export function RecordingView({ videoId, chords, chordDict, initialSnapshot, onDone, onBack }: Props) {
  // Hook runs unconditionally — container div is always mounted in the DOM
  const { containerRef, currentTime, isReady, isPlaying, seekTo } = useYouTubePlayer(videoId)
  const { playChord } = useChordAudio()
  const [soundOn, setSoundOn] = useState(false)

  const [beats, setBeats] = useState<number[]>(initialSnapshot?.beats ?? [])
  const [bpm, setBpm] = useState(initialSnapshot?.bpm ?? 0)
  const [meter, setMeter] = useState(initialSnapshot?.meter ?? 4)
  const [strumPattern, setStrumPattern] = useState<boolean[]>(initialSnapshot?.strumPattern ?? [true, true, true, true])
  const [slots, setSlots] = useState<Record<number, string>>(initialSnapshot?.slots ?? {})
  const [autoFilled, setAutoFilled] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(initialSnapshot ? 'ready' : 'loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedBeat, setSelectedBeat] = useState<number | null>(initialSnapshot ? 0 : null)
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [audioOffset, setAudioOffset] = useState(initialSnapshot?.audioOffset ?? 0)
  const [syncAnchors, setSyncAnchors] = useState<SyncAnchor[]>(initialSnapshot?.syncAnchors ?? [])
  const [sections, setSections] = useState<Section[]>(initialSnapshot?.sections ?? [])
  const [suggestedBoundaries, setSuggestedBoundaries] = useState<number[]>(initialSnapshot?.sectionBoundaries ?? [])
  const [sectionDraft, setSectionDraft] = useState<{ startBar: number | null; endBar: number | null; type: SectionType }>({ startBar: null, endBar: null, type: 'verse' })
  const [recordMode, setRecordMode] = useState(true)

  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime
  const seekToRef = useRef(seekTo)
  seekToRef.current = seekTo
  const beatsRef = useRef(beats)
  beatsRef.current = beats
  const meterRef = useRef(meter)
  meterRef.current = meter
  const activeSlotRef = useRef<HTMLDivElement>(null)
  const lastScrolledBarRef = useRef<number>(-1)

  useEffect(() => {
    if (initialSnapshot) return
    fetch('/api/beats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: `https://www.youtube.com/watch?v=${videoId}`, chords }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => Promise.reject(d.detail ?? `HTTP ${r.status}`))
        return r.json()
      })
      .then(data => {
        setBeats(data.beats)
        setBpm(data.bpm)
        setMeter(data.meter ?? 4)
        // Pre-fill slots from auto-detected chord changes
        if (data.chord_changes?.length > 0) {
          const initial: Record<number, string> = {}
          for (const { beat, chord } of data.chord_changes) initial[beat] = chord
          setSlots(initial)
          setAutoFilled(true)
        }
        if (data.section_boundaries?.length > 0) {
          setSuggestedBoundaries(data.section_boundaries)
        }
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
      if (beats[i] + effectiveOffset(i, meter, syncAnchors, audioOffset) <= currentTime) idx = i
    }
    return idx
  }, [beats, currentTime, audioOffset, syncAnchors, meter])

  const targetBeatIdx = isPlaying ? currentBeatIdx : (selectedBeat ?? currentBeatIdx)

  const lastPlayedBeatRef = useRef(-1)
  useEffect(() => {
    if (!isPlaying || !soundOn || currentBeatIdx < 0 || currentBeatIdx === lastPlayedBeatRef.current) return
    lastPlayedBeatRef.current = currentBeatIdx
    const chord = slots[currentBeatIdx]
    if (chord) {
      const data = chordDict[chord]
      if (data) playChord(data.frets)
    }
  }, [currentBeatIdx, isPlaying, soundOn, slots, chordDict, playChord])

  useEffect(() => {
    setStrumPattern(Array(meter).fill(true))
  }, [meter])

  function toggleStrumBeat(i: number) {
    setStrumPattern(prev => { const n = [...prev]; n[i] = !n[i]; return n })
  }

  const currentBarIdx = Math.floor(Math.max(currentBeatIdx, 0) / 4)
  useEffect(() => {
    if (currentBarIdx !== lastScrolledBarRef.current && activeSlotRef.current) {
      lastScrolledBarRef.current = currentBarIdx
      activeSlotRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentBarIdx])

  const assignChord = useCallback((chord: string) => {
    if (!recordMode) {
      // Test mode: just play the chord, never write to grid
      const chordData = chordDict[chord]
      if (chordData) playChord(chordData.frets)
      return
    }

    const idx = targetBeatIdx
    if (idx < 0) return

    if (soundOn) {
      const chordData = chordDict[chord]
      if (chordData) playChord(chordData.frets)
    }

    // Fill all strum-active positions in the same bar
    const barStart = Math.floor(idx / meter) * meter
    const fills: Record<number, string> = {}
    for (let p = 0; p < meter; p++) {
      const active = strumPattern.length === meter ? strumPattern[p] : true
      if (active) {
        const slotIdx = barStart + p
        if (slotIdx < beats.length) fills[slotIdx] = chord
      }
    }
    setSlots(prev => ({ ...prev, ...fills }))

    if (!isPlaying) {
      // Jump to first strum-active beat of next bar
      const nextBarStart = barStart + meter
      const firstActive = strumPattern.indexOf(true)
      const nextTarget = nextBarStart + (firstActive >= 0 ? firstActive : 0)
      setSelectedBeat(nextTarget < beats.length ? nextTarget : idx)
    }
  }, [recordMode, targetBeatIdx, isPlaying, beats.length, meter, strumPattern, chordDict, playChord, soundOn])

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
    for (let i = 0; i < beats.length; i += meter) {
      const row: number[] = []
      for (let j = 0; j < meter && i + j < beats.length; j++) row.push(i + j)
      result.push(row)
    }
    return result
  }, [beats, meter])

  const adjustBarOffset = useCallback((barIdx: number, delta: number) => {
    setSyncAnchors(prev => {
      const current = effectiveOffset(barIdx * meterRef.current, meterRef.current, prev, audioOffset)
      const newVal = Math.round((current + delta) * 100) / 100
      const rest = prev.filter(a => a.barStart !== barIdx)
      return [...rest, { barStart: barIdx, offset: newVal }].sort((a, b) => a.barStart - b.barStart)
    })
  }, [audioOffset])

  const clearBarAnchor = useCallback((barIdx: number) => {
    setSyncAnchors(prev => prev.filter(a => a.barStart !== barIdx))
  }, [])

  const applySection = useCallback((startBar: number, endBar: number, type: SectionType) => {
    const template = sections
      .filter(s => s.type === type)
      .sort((a, b) => a.startBar - b.startBar)[0]

    if (template) {
      const templateLen = template.endBar - template.startBar + 1
      const m = meterRef.current
      const totalBeats = beatsRef.current.length
      setSlots(prev => {
        const n = { ...prev }
        for (let i = 0; i <= endBar - startBar; i++) {
          const srcBar = template.startBar + (i % templateLen)
          const dstBar = startBar + i
          for (let p = 0; p < m; p++) {
            const srcSlot = srcBar * m + p
            const dstSlot = dstBar * m + p
            if (dstSlot < totalBeats) {
              const srcChord = (prev as Record<number, string | undefined>)[srcSlot]
              if (srcChord !== undefined) n[dstSlot] = srcChord
              else delete n[dstSlot]
            }
          }
        }
        return n
      })
    }

    setSections(prev => {
      const filtered = prev.filter(s => s.endBar < startBar || s.startBar > endBar)
      return [...filtered, { type, startBar, endBar }].sort((a, b) => a.startBar - b.startBar)
    })
    setSuggestedBoundaries(prev => prev.filter(b => b < startBar || b > endBar))
  }, [sections])

  function buildTimeline(): ChordEntry[] {
    return Object.entries(slots)
      .map(([idx, chord]) => {
        const i = parseInt(idx)
        return { time: beats[i] + effectiveOffset(i, meter, syncAnchors, audioOffset), chord }
      })
      .sort((a, b) => a.time - b.time)
  }

  const fillBarPattern = useCallback((positions: number[]) => {
    if (selectedBeat === null) return
    const chord = slots[selectedBeat]
    if (!chord) return
    const barStart = Math.floor(selectedBeat / meter) * meter
    setSlots(prev => {
      const n = { ...prev }
      for (let p = 0; p < meter; p++) delete n[barStart + p]
      for (const p of positions) {
        const slotIdx = barStart + p
        if (slotIdx < beats.length) n[slotIdx] = chord
      }
      return n
    })
  }, [selectedBeat, slots, meter, beats.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'j') seekToRef.current(Math.max(0, currentTimeRef.current - 5))
      else if (e.key === 'q') fillBarPattern([0])
      else if (e.key === 'w') fillBarPattern([0, 2])
      else if (e.key === 'e') fillBarPattern([1, 3])
      else if (e.key === 'r') fillBarPattern(Array.from({ length: meter }, (_, i) => i))
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBeat !== null) {
        setSlots(prev => { const n = { ...prev }; delete n[selectedBeat]; return n })
        setSelectedBeat(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fillBarPattern, meter, selectedBeat])

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
  const selectedChord = selectedBeat !== null ? (slots[selectedBeat] ?? null) : null

  return (
    <div className="recording-screen">
      <header className="app-header app-header-compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1>UkeSync</h1>
          <span className="mode-badge mode-badge-creator">Creator</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status === 'ready' && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {Math.round(bpm)} BPM · {meter}/4 · {beats.length} beats
            </span>
          )}
          <button className="btn-ghost" onClick={() => seekTo(Math.max(0, currentTime - 5))} title="Rewind 5 seconds (J)">⏪ 5s</button>
          <button className="btn-ghost" onClick={onBack}>← New song</button>
        </div>
      </header>

      <div className="recording-body">

        {/* ── Left: video + chord strip ── */}
        <div className="recording-main-col">
          <div className="recording-video-col">
            <div className="yt-wrapper">
              <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
              {!isReady && status === 'ready' && (
                <div className="yt-loading">Loading player…</div>
              )}
            </div>
          </div>

          <div className="tap-strip">
            <div className="tap-instructions">
              {status === 'ready'
                ? isPlaying
                  ? <>Click a chord to assign it to the current beat · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
                  : <>Paused — select a beat slot, then click a chord · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
                : <>Beats loading — chord charts available for reference · <kbd>1</kbd>–<kbd>{chords.length}</kbd></>
              }
            </div>

            <div className="strum-pattern">
              <span className="strum-label">Strum</span>
              <div className="strum-beats">
                {strumPattern.map((active, i) => (
                  <button
                    key={i}
                    className={`strum-beat-btn${active ? ' strum-beat-active' : ''}`}
                    onClick={() => toggleStrumBeat(i)}
                    title={`Beat ${i + 1} — click to toggle`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div className="strum-presets">
                <button className="btn-small" onClick={() => setStrumPattern(Array(meter).fill(true))}>All</button>
                {meter === 4 && (
                  <button className="btn-small" onClick={() => setStrumPattern([true, false, true, false])}>1 &amp; 3</button>
                )}
                {meter === 3 && (
                  <button className="btn-small" onClick={() => setStrumPattern([true, false, true])}>1 &amp; 3</button>
                )}
                <button className="btn-small" onClick={() => setStrumPattern([true, ...Array(meter - 1).fill(false)])}>1 only</button>
              </div>
              <button
                className={`strum-sound-btn${soundOn ? ' strum-sound-on' : ''}`}
                onClick={() => setSoundOn(v => !v)}
                title={soundOn ? 'Mute chord preview' : 'Enable chord preview sound'}
              >
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>

            <div className="chord-mode-bar">
              <button
                className={`chord-mode-btn${recordMode ? ' chord-mode-rec' : ''}`}
                onClick={() => setRecordMode(true)}
                title="Click chords to record them into the grid"
              >
                <span className="chord-mode-dot" />
                Rec
              </button>
              <button
                className={`chord-mode-btn${!recordMode ? ' chord-mode-test' : ''}`}
                onClick={() => setRecordMode(false)}
                title="Click chords to hear them without changing the grid"
              >
                Test
              </button>
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

        {/* ── Right: full-height beat grid ── */}
        <div className="recording-grid-col">
          {status === 'ready' ? (
            <>
              <div className="tap-log-header">
                <span>
                  Beat Grid{' '}
                  <span className="chord-count">({assignedCount} of {beats.length})</span>
                  {autoFilled && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      auto-filled
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-small" onClick={undoLast} disabled={assignedCount === 0}>Undo</button>
                  <button className="btn-small" onClick={() => setSlots({})} disabled={assignedCount === 0}>Clear</button>
                </div>
              </div>

              <div className="beat-offset-bar">
                <span className="beat-offset-label">Base</span>
                <button className="beat-offset-btn" onClick={() => setAudioOffset(v => Math.round((v - 0.05) * 100) / 100)}>−</button>
                <span className="beat-offset-value">
                  {audioOffset >= 0 ? '+' : ''}{audioOffset.toFixed(2)}s
                </span>
                <button className="beat-offset-btn" onClick={() => setAudioOffset(v => Math.round((v + 0.05) * 100) / 100)}>+</button>
                <button className="beat-offset-reset" onClick={() => setAudioOffset(0)} disabled={audioOffset === 0}>Reset</button>
                {syncAnchors.length > 0 && (
                  <button className="beat-offset-reset" style={{ marginLeft: 'auto' }} onClick={() => setSyncAnchors([])}>Clear all anchors</button>
                )}
              </div>

              <div className="beat-grid-scroll">
                {bars.map((beatIndices, barIdx) => {
                  const sectionStart = sections.find(s => s.startBar === barIdx)
                  const inSection = sections.find(s => s.startBar <= barIdx && barIdx <= s.endBar)
                  const isSuggestedBoundary = suggestedBoundaries.includes(barIdx) && !sectionStart
                  return (
                    <Fragment key={barIdx}>
                      {isSuggestedBoundary && (
                        <div className="suggested-boundary-row">
                          <span className="suggested-boundary-label">detected boundary</span>
                          <button
                            className="btn-small"
                            onClick={() => {
                              const nextBoundary = suggestedBoundaries.find(b => b > barIdx)
                              const endBar = nextBoundary !== undefined ? nextBoundary - 1 : bars.length - 1
                              setSectionDraft(d => ({ ...d, startBar: barIdx, endBar }))
                            }}
                          >Label</button>
                          <button
                            className="section-chip-del"
                            onClick={() => setSuggestedBoundaries(prev => prev.filter(b => b !== barIdx))}
                          >×</button>
                        </div>
                      )}
                      {sectionStart && (
                        <div className="section-label-row">
                          <span className={`section-badge section-badge-${sectionStart.type}`}>{sectionStart.type}</span>
                          <button
                            className="btn-delete"
                            title={`Remove "${sectionStart.type}" label`}
                            onClick={() => setSections(prev => prev.filter(s => s.startBar !== barIdx))}
                          >×</button>
                        </div>
                      )}
                      <div
                        className="beat-row"
                        style={inSection ? { borderLeft: `3px solid ${SECTION_BORDER_COLORS[inSection.type]}` } : undefined}
                      >
                        <span
                          className="bar-number bar-number-seek"
                          title={`Seek to bar ${barIdx + 1}`}
                          onClick={() => {
                            const firstBeat = barIdx * meter
                            if (firstBeat < beats.length) {
                              seekTo(beats[firstBeat] + effectiveOffset(firstBeat, meter, syncAnchors, audioOffset))
                            }
                          }}
                        >{barIdx + 1}</span>
                        {(() => {
                          const hasAnchor = syncAnchors.some(a => a.barStart === barIdx)
                          const effOff = effectiveOffset(barIdx * meter, meter, syncAnchors, audioOffset)
                          const offStr = `${effOff >= 0 ? '+' : ''}${effOff.toFixed(2)}`
                          return (
                            <div className="row-offset-ctrl">
                              <button className="row-offset-btn" onClick={() => adjustBarOffset(barIdx, -0.05)}>−</button>
                              <span
                                className={`row-offset-val${hasAnchor ? ' row-offset-explicit' : ''}`}
                                onClick={hasAnchor ? () => clearBarAnchor(barIdx) : undefined}
                                title={hasAnchor ? `${offStr}s — click to clear` : `${offStr}s (inherited)`}
                              >
                                {offStr}
                              </span>
                              <button className="row-offset-btn" onClick={() => adjustBarOffset(barIdx, +0.05)}>+</button>
                            </div>
                          )
                        })()}
                        {beatIndices.map(beatIdx => {
                          const isCurrent = beatIdx === currentBeatIdx
                          const isTarget = !isPlaying && beatIdx === targetBeatIdx
                          const chord = slots[beatIdx]
                          let cls = 'beat-slot'
                          if (isCurrent) cls += ' beat-slot-current'
                          if (isTarget) cls += ' beat-slot-target'
                          if (chord) cls += ' beat-slot-filled'
                          if (dragSrc === beatIdx) cls += ' beat-slot-drag-src'
                          if (dragOver === beatIdx && dragSrc !== null && dragSrc !== beatIdx) cls += ' beat-slot-drag-over'
                          return (
                            <div
                              key={beatIdx}
                              ref={isCurrent ? activeSlotRef : undefined}
                              className={cls}
                              draggable={!!chord}
                              onDragStart={chord ? () => setDragSrc(beatIdx) : undefined}
                              onDragEnd={() => { setDragSrc(null); setDragOver(null) }}
                              onDragOver={(e) => { e.preventDefault(); setDragOver(beatIdx) }}
                              onDragLeave={() => setDragOver(d => d === beatIdx ? null : d)}
                              onDrop={(e) => {
                                e.preventDefault()
                                const src = dragSrc
                                if (src !== null && src !== beatIdx) {
                                  const srcChord = slots[src]
                                  if (srcChord) setSlots(prev => { const n = { ...prev }; delete n[src]; n[beatIdx] = srcChord; return n })
                                }
                                setDragSrc(null); setDragOver(null)
                              }}
                              title={chord ? 'Click to select · Drag to move' : 'Click to select'}
                              onClick={() => {
                                setSelectedBeat(beatIdx)
                                if (soundOn && chord) {
                                  const data = chordDict[chord]
                                  if (data) playChord(data.frets)
                                }
                              }}
                            >
                              {chord || ''}
                            </div>
                          )
                        })}
                      </div>
                    </Fragment>
                  )
                })}
              </div>

              <div className="grid-fill-section">
                <div className="fill-bar-row">
                  <span className="fill-bar-label">Fill</span>
                  <button className="fill-bar-btn" onClick={() => fillBarPattern([0])} disabled={!selectedChord} title="Fill beat 1 only (Q)">
                    <kbd>Q</kbd> 1
                  </button>
                  <button className="fill-bar-btn" onClick={() => fillBarPattern([0, 2])} disabled={!selectedChord} title="Fill beats 1 & 3 (W)">
                    <kbd>W</kbd> 1&amp;3
                  </button>
                  <button className="fill-bar-btn" onClick={() => fillBarPattern([1, 3])} disabled={!selectedChord} title="Fill beats 2 & 4 (E)">
                    <kbd>E</kbd> 2&amp;4
                  </button>
                  <button className="fill-bar-btn" onClick={() => fillBarPattern(Array.from({ length: meter }, (_, i) => i))} disabled={!selectedChord} title="Fill all beats in bar (R)">
                    <kbd>R</kbd> All
                  </button>
                </div>
                <div className="section-label-row-form">
                  <span className="section-form-label">Section</span>
                  <input
                    type="number"
                    className="section-bar-input"
                    min={1}
                    max={bars.length}
                    placeholder="Bar"
                    value={sectionDraft.startBar !== null ? sectionDraft.startBar + 1 : ''}
                    onChange={e => setSectionDraft(d => ({ ...d, startBar: e.target.value !== '' ? Math.max(0, parseInt(e.target.value) - 1) : null }))}
                  />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>–</span>
                  <input
                    type="number"
                    className="section-bar-input"
                    min={1}
                    max={bars.length}
                    placeholder="Bar"
                    value={sectionDraft.endBar !== null ? sectionDraft.endBar + 1 : ''}
                    onChange={e => setSectionDraft(d => ({ ...d, endBar: e.target.value !== '' ? Math.max(0, parseInt(e.target.value) - 1) : null }))}
                  />
                  <select
                    className="section-type-select"
                    value={sectionDraft.type}
                    onChange={e => setSectionDraft(d => ({ ...d, type: e.target.value as SectionType }))}
                  >
                    {(['intro', 'verse', 'chorus', 'pre-chorus', 'bridge', 'instrumental'] as const).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    className="btn-small"
                    disabled={
                      sectionDraft.startBar === null ||
                      sectionDraft.endBar === null ||
                      sectionDraft.endBar < sectionDraft.startBar ||
                      sectionDraft.startBar >= bars.length
                    }
                    onClick={() => {
                      if (sectionDraft.startBar !== null && sectionDraft.endBar !== null) {
                        applySection(sectionDraft.startBar, Math.min(sectionDraft.endBar, bars.length - 1), sectionDraft.type)
                        setSectionDraft(d => ({ ...d, startBar: null, endBar: null }))
                      }
                    }}
                  >Apply</button>
                  {sections.length > 0 && (
                    <div className="section-chips">
                      {sections.map((s, i) => (
                        <span key={i} className={`section-badge section-badge-${s.type}`}>
                          {s.type} {s.startBar + 1}–{s.endBar + 1}
                          <button className="section-chip-del" onClick={() => setSections(prev => prev.filter((_, j) => j !== i))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="tap-footer">
                <button
                  className="btn-primary"
                  onClick={() => onDone(buildTimeline(), bpm, meter, strumPattern, { beats, bpm, meter, slots, strumPattern, audioOffset, syncAnchors, sections, sectionBoundaries: suggestedBoundaries })}
                  disabled={assignedCount === 0}
                >
                  ▶ Playalong
                </button>
              </div>
            </>
          ) : (
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
    </div>
  )
}
