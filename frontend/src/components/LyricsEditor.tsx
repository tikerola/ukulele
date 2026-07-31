import { useLayoutEffect, useRef, useState } from 'react'
import { parseLyrics, SECTION_HEADER_RE } from '../lib/parseLyrics'

interface Props {
  text: string
  onTextChange: (text: string) => void
  sectionNames: string[]
  nextSectionName?: string | null
}

export function LyricsEditor({ text, onTextChange, sectionNames, nextSectionName }: Props) {
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

  // Scrolls so the most recently added [SectionName] line lands at the very
  // top of the textarea's viewport — that's exactly where the not-yet-tagged
  // lyrics that need the *next* tag start, so this saves hunting for it by
  // hand every time. Line-based rather than character-based since scrollTop
  // is measured in pixels-per-line, not characters.
  function scrollToLastSection() {
    const el = textareaRef.current
    if (!el) return
    const lines = text.split('\n')
    let lastHeaderLine = -1
    lines.forEach((line, i) => {
      if (SECTION_HEADER_RE.test(line.trim())) lastHeaderLine = i
    })
    if (lastHeaderLine === -1) return
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18
    // Deliberately not focusing the textarea — if the caret weren't also on
    // (or right after) this line, focusing would make the browser scroll
    // the caret back into view and undo this.
    el.scrollTop = lastHeaderLine * lineHeight
  }

  if (editing) {
    const blocks = parseLyrics(text)
    return (
      <div className="lyrics-guide lyrics-guide-editing">
        {sectionNames.length > 0 && (
          <div className="lyrics-section-buttons">
            {sectionNames.map(name => (
              <button
                key={name}
                type="button"
                className={`btn-small${name === nextSectionName ? ' lyrics-section-btn-next' : ''}`}
                onClick={() => insertSectionTag(name)}
                title={name === nextSectionName ? `${name} is next in the timeline and isn't tagged in the lyrics yet` : undefined}
              >
                [{name}]
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
          {blocks.length > 0 && (
            <button
              className="btn-ghost"
              onClick={scrollToLastSection}
              title="Scroll so the lyrics right after your last section tag are at the top"
            >
              Next without section
            </button>
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
