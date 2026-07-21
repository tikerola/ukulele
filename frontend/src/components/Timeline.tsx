import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChordEntry } from '../types'

interface Props {
  timeline: ChordEntry[]
  duration: number
  currentTime: number
  selectedIdx: number | null
  onSelectChange: (idx: number | null) => void
  onChange: (timeline: ChordEntry[]) => void
  onSeek: (time: number) => void
  locked: boolean
}

const MIN_PPS = 10
const MAX_PPS = 200
const DEFAULT_PPS = 40

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pickTickStep(pps: number): number {
  // keep ticks roughly 60-120px apart
  const steps = [1, 2, 5, 10, 15, 30, 60]
  for (const step of steps) {
    if (step * pps >= 60) return step
  }
  return 60
}

export function Timeline({ timeline, duration, currentTime, selectedIdx, onSelectChange, onChange, onSeek, locked }: Props) {
  const [pps, setPps] = useState(DEFAULT_PPS)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrolledSecondRef = useRef(-1)

  const trackWidth = Math.max(duration * pps, 200)

  const timeFromClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const x = clientX - rect.left
    return Math.min(Math.max(x / pps, 0), duration)
  }, [pps, duration])

  function commitTimeline(next: ChordEntry[]) {
    onChange([...next].sort((a, b) => a.time - b.time))
  }

  function handleTrackClick(e: React.MouseEvent) {
    onSeek(timeFromClientX(e.clientX))
    onSelectChange(null)
  }

  function handleMarkerPointerDown(e: React.PointerEvent, idx: number) {
    e.stopPropagation()
    if (locked) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIdx(idx)
    onSelectChange(idx)
  }

  function handleMarkerPointerMove(e: React.PointerEvent) {
    if (dragIdx === null) return
    const t = timeFromClientX(e.clientX)
    const next = timeline.map((entry, i) => i === dragIdx ? { ...entry, time: t } : entry)
    onChange(next)
  }

  function handleMarkerPointerUp() {
    if (dragIdx === null) return
    const draggedEntry = timeline[dragIdx]
    const sorted = [...timeline].sort((a, b) => a.time - b.time)
    onChange(sorted)
    onSelectChange(sorted.indexOf(draggedEntry))
    setDragIdx(null)
  }

  function deleteEntry(idx: number) {
    commitTimeline(timeline.filter((_, i) => i !== idx))
    onSelectChange(null)
  }

  function handleClearAll() {
    if (locked || timeline.length === 0) return
    const count = timeline.length
    const ok = window.confirm(`Clear all ${count} chord${count === 1 ? '' : 's'} from the timeline? This can't be undone.`)
    if (!ok) return
    onChange([])
    onSelectChange(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (locked) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null) {
        deleteEntry(selectedIdx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, timeline, locked])

  const currentSecond = Math.floor(currentTime)
  useEffect(() => {
    if (currentSecond === lastScrolledSecondRef.current) return
    lastScrolledSecondRef.current = currentSecond
    const container = scrollRef.current
    if (!container) return
    const playheadX = currentTime * pps
    const { scrollLeft, clientWidth } = container
    if (playheadX < scrollLeft + 60 || playheadX > scrollLeft + clientWidth - 60) {
      container.scrollTo({ left: Math.max(0, playheadX - clientWidth / 2), behavior: 'smooth' })
    }
  }, [currentSecond, currentTime, pps])

  const tickStep = pickTickStep(pps)
  const ticks = useMemo(() => {
    const result: number[] = []
    for (let t = 0; t <= duration; t += tickStep) result.push(t)
    return result
  }, [duration, tickStep])

  return (
    <div className="timeline-wrapper">
      <div className="timeline-toolbar">
        <span className="timeline-label">Timeline <span className="chord-count">({timeline.length})</span></span>
        <div className="timeline-toolbar-actions">
          <div className="timeline-zoom">
            <button className="btn-small" onClick={() => setPps(v => Math.max(MIN_PPS, v - 10))} title="Zoom out">−</button>
            <button className="btn-small" onClick={() => setPps(v => Math.min(MAX_PPS, v + 10))} title="Zoom in">+</button>
          </div>
          <button className="btn-clear" onClick={handleClearAll} disabled={timeline.length === 0 || locked} title={locked ? 'Unlock to clear the timeline' : 'Clear entire timeline'}>
            Clear all
          </button>
        </div>
      </div>
      <div className="timeline-scroll" ref={scrollRef}>
        <div
          className="timeline-track"
          ref={trackRef}
          style={{ width: trackWidth }}
          onClick={handleTrackClick}
          onPointerMove={handleMarkerPointerMove}
          onPointerUp={handleMarkerPointerUp}
        >
          <div className="timeline-ruler">
            {ticks.map(t => (
              <span key={t} className="timeline-tick" style={{ left: t * pps }}>{formatTime(t)}</span>
            ))}
          </div>

          <div className="timeline-playhead" style={{ left: currentTime * pps }} />

          {timeline.map((entry, idx) => (
            <div
              key={idx}
              className={`timeline-marker${selectedIdx === idx ? ' timeline-marker-selected' : ''}${locked ? ' timeline-marker-locked' : ''}`}
              style={{ left: entry.time * pps }}
              onPointerDown={e => handleMarkerPointerDown(e, idx)}
              onClick={e => { e.stopPropagation(); if (!locked) onSelectChange(idx) }}
              title={locked ? `${entry.chord} @ ${formatTime(entry.time)}` : `${entry.chord} @ ${formatTime(entry.time)} — drag to move, click to select`}
            >
              {entry.chord}
            </div>
          ))}
        </div>
      </div>

      {selectedIdx !== null && timeline[selectedIdx] && (
        <div className="timeline-popover">
          <span className="timeline-popover-chord">{timeline[selectedIdx].chord}</span>
          <span>@ {formatTime(timeline[selectedIdx].time)}</span>
          <span className="timeline-popover-hint">Click a chord below to change it · Esc to deselect</span>
          <button className="btn-delete" onClick={() => deleteEntry(selectedIdx)}>× Delete</button>
        </div>
      )}
    </div>
  )
}
