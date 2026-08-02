import { useEffect, useRef, useState } from 'react'
import type { ReferenceItem } from '../lib/parseReference'

interface Props {
  text: string
  onTextChange: (text: string) => void
  items: ReferenceItem[]
  pointer: number
  onPointerChange: (index: number) => void
  locked: boolean
}

export function ReferenceGuide({ text, onTextChange, items, pointer, onPointerChange, locked }: Props) {
  const [editing, setEditing] = useState(text.trim().length === 0)
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    chipRefs.current[pointer]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [pointer])

  // Kicks out of an in-progress edit if the Creator gets locked mid-edit,
  // same as Timeline clearing its own selection on lock.
  useEffect(() => {
    if (locked) setEditing(false)
  }, [locked])

  if (editing) {
    return (
      <div className="reference-guide reference-guide-editing">
        <textarea
          className="reference-textarea"
          rows={4}
          placeholder="Paste the chord progression from Ultimate Guitar (or any chord chart) here — chords above lyrics, [Verse]/[Chorus] labels optional…"
          value={text}
          onChange={e => onTextChange(e.target.value)}
          autoFocus
        />
        <div className="reference-editing-actions">
          <button className="btn-small" onClick={() => setEditing(false)}>Done</button>
          {text.trim().length > 0 && (
            <button className="btn-ghost" onClick={() => { onTextChange(''); onPointerChange(0) }}>Clear</button>
          )}
          <span className="reference-parse-hint">
            {text.trim().length === 0
              ? 'No reference — recording works fine without one'
              : items.length > 0
                ? `Recognized ${items.length} chord${items.length === 1 ? '' : 's'}`
                : 'No chords recognized yet — check the formatting'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="reference-guide">
      <button
        className="btn-small reference-edit-btn"
        onClick={() => setEditing(true)}
        disabled={locked}
        title={locked ? 'Unlock to edit the reference progression' : 'Edit reference progression'}
      >✎ Edit</button>
      {items.length === 0 ? (
        <span className="reference-empty-hint">No chords recognized in the pasted text</span>
      ) : (
        <>
          <button
            className="btn-small"
            onClick={() => onPointerChange(Math.max(0, pointer - 1))}
            disabled={pointer <= 0}
            title="Step back"
          >‹</button>
          <div className="reference-strip">
            {items.map((item, i) => (
              <span key={i} className="reference-chip-wrap">
                {item.section && (i === 0 || item.section !== items[i - 1].section) && (
                  <span className="reference-section-label">{item.section}</span>
                )}
                <span
                  ref={el => { chipRefs.current[i] = el }}
                  className={`reference-chip${i === pointer ? ' reference-chip-current' : ''}${i < pointer ? ' reference-chip-done' : ''}`}
                >
                  {item.chord}
                </span>
              </span>
            ))}
          </div>
          <button
            className="btn-small"
            onClick={() => onPointerChange(Math.min(items.length, pointer + 1))}
            disabled={pointer >= items.length}
            title="Step forward"
          >›</button>
        </>
      )}
    </div>
  )
}
