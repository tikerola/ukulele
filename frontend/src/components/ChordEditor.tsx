import { useEffect, useRef } from 'react'
import type { ChordEntry } from '../types'

interface Props {
  timeline: ChordEntry[]
  currentTime: number
  onChange: (updated: ChordEntry[]) => void
}

export function ChordEditor({ timeline, currentTime, onChange }: Props) {
  const activeRowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentTime])

  function updateTime(idx: number, value: string) {
    const t = parseFloat(value)
    if (isNaN(t) || t < 0) return
    const updated = timeline.map((e, i) => i === idx ? { ...e, time: t } : e)
    onChange(updated.sort((a, b) => a.time - b.time))
  }

  function updateChord(idx: number, value: string) {
    onChange(timeline.map((e, i) => i === idx ? { ...e, chord: value.trim() } : e))
  }

  function deleteEntry(idx: number) {
    onChange(timeline.filter((_, i) => i !== idx))
  }

  function addEntry() {
    const lastTime = timeline.length > 0 ? timeline[timeline.length - 1].time + 2 : 0
    onChange([...timeline, { time: lastTime, chord: '?' }])
  }

  let activeIdx = 0
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (currentTime >= timeline[i].time) { activeIdx = i; break }
  }

  return (
    <div className="chord-editor">
      <div className="chord-editor-header">
        <span>Chord Timeline <span className="chord-count">({timeline.length})</span></span>
        <button className="btn-small" onClick={addEntry}>+ Add</button>
      </div>
      <div className="chord-editor-table-wrapper">
        <table className="chord-editor-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Chord</th>
              <th>Time (s)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry, idx) => {
              const isActive = idx === activeIdx
              return (
                <tr
                  key={idx}
                  ref={isActive ? activeRowRef : undefined}
                  className={isActive ? 'row-active' : ''}
                >
                  <td className="col-idx">{idx + 1}</td>
                  <td>
                    <input
                      className="input-chord"
                      value={entry.chord}
                      onChange={e => updateChord(idx, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input-time"
                      type="number"
                      step="0.1"
                      min="0"
                      value={entry.time.toFixed(2)}
                      onChange={e => updateTime(idx, e.target.value)}
                    />
                  </td>
                  <td>
                    <button className="btn-delete" onClick={() => deleteEntry(idx)}>×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
