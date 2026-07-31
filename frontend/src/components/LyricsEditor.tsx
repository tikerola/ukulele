import { useLayoutEffect, useRef, useState } from 'react'
import { parseLyrics } from '../lib/parseLyrics'

interface Props {
  text: string
  onTextChange: (text: string) => void
  sectionNames: string[]
}

export function LyricsEditor({ text, onTextChange, sectionNames }: Props) {
  const [editing, setEditing] = useState(text.trim().length === 0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingSelectionRef = useRef<number | null>(null)

  // The textarea is controlled, so writing to it directly would be
  // clobbered by the next render — instead stash where the caret should
  // land and apply it once React has re-rendered with the new value.
  useLayoutEffect(() => {
    const pos = pendingSelectionRef.current
    if (pos == null) return
    pendingSelectionRef.current = null
    const el = textareaRef.current
    el?.focus()
    el?.setSelectionRange(pos, pos)
  }, [text])

  function insertSectionTag(name: string) {
    const el = textareaRef.current
    const tag = `[${name}]\n`
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    pendingSelectionRef.current = start + tag.length
    onTextChange(text.slice(0, start) + tag + text.slice(end))
  }

  if (editing) {
    const blocks = parseLyrics(text)
    return (
      <div className="lyrics-guide lyrics-guide-editing">
        {sectionNames.length > 0 && (
          <div className="lyrics-section-buttons">
            {sectionNames.map(name => (
              <button key={name} type="button" className="btn-small" onClick={() => insertSectionTag(name)}>
                + [{name}]
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="lyrics-textarea"
          rows={6}
          placeholder="Paste the song's lyrics here, and use the buttons above to tag each part with the section it belongs to…"
          value={text}
          onChange={e => onTextChange(e.target.value)}
          autoFocus
        />
        <div className="lyrics-editing-actions">
          <button className="btn-small" onClick={() => setEditing(false)}>Done</button>
          {text.trim().length > 0 && (
            <button className="btn-ghost" onClick={() => onTextChange('')}>Clear</button>
          )}
          <span className="lyrics-summary-hint">
            {text.trim().length === 0
              ? 'No lyrics added — Playalong works fine without them'
              : blocks.length > 0
                ? `Recognized ${blocks.length} section${blocks.length === 1 ? '' : 's'} tagged`
                : 'No [SectionName] tags recognized yet'}
          </span>
        </div>
      </div>
    )
  }

  const blocks = parseLyrics(text)
  const lineCount = blocks.reduce((n, b) => n + (b.text ? b.text.split('\n').length : 0), 0)
  const coveredNames = new Set(blocks.map(b => b.name)).size

  return (
    <div className="lyrics-guide">
      <button className="btn-small" onClick={() => setEditing(true)} title="Edit lyrics">✎ Edit lyrics</button>
      <span className="lyrics-summary-hint">
        {blocks.length === 0
          ? 'No lyrics added'
          : `${lineCount} line${lineCount === 1 ? '' : 's'} across ${coveredNames} of ${sectionNames.length} section${sectionNames.length === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}
