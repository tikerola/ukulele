import { useEffect, useMemo, useRef, useState } from 'react'
import { extractLyricsOnly, type ReferenceItem } from '../lib/parseReference'

interface Props {
  text: string
  onTextChange: (text: string) => void
  items: ReferenceItem[]
  pointer: number
  onPointerChange: (index: number) => void
  locked: boolean
  knownChords: string[]
  onImportChords: (chords: string[]) => void
  lyricsText: string
  onImportLyrics: (text: string) => void
}

export function ReferenceGuide({
  text, onTextChange, items, pointer, onPointerChange, locked,
  knownChords, onImportChords, lyricsText, onImportLyrics,
}: Props) {
  const [editing, setEditing] = useState(text.trim().length === 0)
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])

  // Chords found in the pasted text that aren't already in the recording
  // palette — offered as an "import" so the user doesn't have to retype
  // them into the "Chords in this song" field by hand.
  const newChords = useMemo(() => {
    const known = new Set(knownChords)
    const found: string[] = []
    for (const item of items) {
      if (!known.has(item.chord) && !found.includes(item.chord)) found.push(item.chord)
    }
    return found
  }, [items, knownChords])

  const extractedLyrics = useMemo(() => extractLyricsOnly(text), [text])

  // Re-offering the same import after the user already dismissed it (without
  // changing the pasted text) would just be nagging — tracked per pasted
  // text so a fresh paste brings the suggestion back.
  const [chordsDismissedFor, setChordsDismissedFor] = useState<string | null>(null)
  const [lyricsDismissedFor, setLyricsDismissedFor] = useState<string | null>(null)
  const showChordsSuggestion = newChords.length > 0 && chordsDismissedFor !== text
  // Only offered when the Lyrics editor is empty — once it has content
  // (whether from this import or typed/pasted separately), importing again
  // would silently overwrite whatever's already there.
  const showLyricsSuggestion = extractedLyrics.trim().length > 0 && lyricsText.trim().length === 0 && lyricsDismissedFor !== text

  const suggestions = (showChordsSuggestion || showLyricsSuggestion) && (
    <div className="reference-import-suggestions">
      {showChordsSuggestion && (
        <div className="reference-import-banner">
          <span>Found {newChords.length} new chord{newChords.length === 1 ? '' : 's'} not in your palette: <strong>{newChords.join(', ')}</strong></span>
          <button className="btn-small" onClick={() => { onImportChords(newChords); setChordsDismissedFor(text) }}>Import chords</button>
          <button className="btn-ghost" onClick={() => setChordsDismissedFor(text)}>Dismiss</button>
        </div>
      )}
      {showLyricsSuggestion && (
        <div className="reference-import-banner">
          <span>This text has lyrics too — import them into the Lyrics editor?</span>
          <button className="btn-small" onClick={() => { onImportLyrics(extractedLyrics); setLyricsDismissedFor(text) }}>Import lyrics</button>
          <button className="btn-ghost" onClick={() => setLyricsDismissedFor(text)}>Dismiss</button>
        </div>
      )}
    </div>
  )

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
        {suggestions}
      </div>
    )
  }

  return (
    <>
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
      {suggestions}
    </>
  )
}
