import { useId } from 'react'
import type { ChordData } from '../types'
import { getChordColor } from '../lib/chordColors'

interface Props {
  chord: string
  data: ChordData | null
  size?: number
  accentHeight?: number
  nameFontSize?: number
  // When set, the diagram becomes editable: each string gets a click
  // target spanning its column, and its open-string letter is shown above
  // the nut (instead of staying blank) so it's clear which string is which
  // before muting it. Passed only by the Creator's chord-tile editor —
  // every other place this component is used (the live tap strip, overlays,
  // count-in preview) leaves it unset and renders exactly as before.
  onToggleString?: (stringIndex: number) => void
}

const STRINGS = 4
const FRETS_SHOWN = 4
const STRING_NAMES = ['G', 'C', 'E', 'A']
const DOT_R = 7

export function ChordDiagram({ chord, data, size = 1, accentHeight = 10, nameFontSize = 10, onToggleString }: Props) {
  const vW = 90
  // Chord-name row grows with nameFontSize so a bigger label never overlaps the fretboard.
  const vH = 105 + nameFontSize
  const W = vW * size
  const H = vH * size

  const strX = [21, 37, 53, 69]
  const nutY = 26
  const fretH = 18
  const fretY = (f: number) => nutY + fretH * f

  const color = getChordColor(chord)
  const clipId = `chord-card-${useId().replace(/:/g, '')}`

  if (!data) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${vW} ${vH}`}>
        <defs>
          <clipPath id={clipId}><rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} /></clipPath>
        </defs>
        <rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} fill="#3a2a1e" stroke="#55402f" />
        <rect x={1} y={1} width={vW - 2} height={accentHeight} fill={color} stroke="#f4e6cc" strokeOpacity={0.5} clipPath={`url(#${clipId})`} />
        <text x={vW / 2} y={vH / 2 + 5} textAnchor="middle" fill="#8a7256" fontSize={14}>?</text>
        <text x={vW / 2} y={vH - 5} textAnchor="middle" fill="#b99b78" fontSize={nameFontSize - 1} fontFamily="'Fraunces', Georgia, serif">{chord}</text>
      </svg>
    )
  }

  const frets = data.frets
  const nonZero = frets.filter(f => f > 0)
  const maxFret = nonZero.length > 0 ? Math.max(...nonZero) : 0
  const minFret = nonZero.length > 0 ? Math.min(...nonZero) : 0
  const offset = maxFret > FRETS_SHOWN ? minFret - 1 : 0

  return (
    <svg width={W} height={H} viewBox={`0 0 ${vW} ${vH}`}>
      <defs>
        <clipPath id={clipId}><rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} /></clipPath>
      </defs>
      <rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} fill="#3a2a1e" stroke="#55402f" />
      <rect x={1} y={1} width={vW - 2} height={accentHeight} fill={color} stroke="#f4e6cc" strokeOpacity={0.5} clipPath={`url(#${clipId})`} />

      {/* Nut */}
      {offset === 0
        ? <rect x={strX[0]} y={nutY - 3} width={strX[STRINGS - 1] - strX[0]} height={3} fill="#f4e6cc" />
        : <text x={strX[STRINGS - 1] + 6} y={nutY - 6} fontSize={8} fill="#b99b78">{offset + 1}fr</text>
      }

      {/* Fret lines */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <line key={i}
          x1={strX[0]} y1={fretY(i)}
          x2={strX[STRINGS - 1]} y2={fretY(i)}
          stroke="#55402f" strokeWidth={1}
        />
      ))}

      {/* String lines */}
      {strX.map((x, i) => (
        <line key={i}
          x1={x} y1={nutY}
          x2={x} y2={fretY(FRETS_SHOWN)}
          stroke="#8a6f54" strokeWidth={1.2}
        />
      ))}

      {/* Muted string indicators — the × straddles the nut line itself (the
          standard chord-chart convention), which also keeps it clear of the
          accent bar above: the 13.3 accentHeight most callers (Playalong
          overlay, section boards) actually use only reaches y=14.3, well
          short of the nut at y=26. In edit mode, an unmuted string shows
          its open letter above the nut instead of staying blank, so it's
          clear which column mutes which string before clicking it. */}
      {frets.map((fret, i) => {
        if (fret === -1) {
          // Drawn as two crossing strokes rather than a text glyph, so its
          // size can be pinned exactly to DOT_R (the finger dots' radius)
          // instead of guessing at a font-size-to-glyph-size ratio: its
          // corners just touch a circle of radius DOT_R, so it reads as
          // "about as big as a finger dot, barely fitting inside one."
          // Centered on the nut rect's own vertical center (nutY-3 to
          // nutY), so the X's crossing point lands exactly on the nut.
          const cx = strX[i]
          const cy = nutY - 1.5
          const r = DOT_R / Math.SQRT2
          return (
            <g key={i}>
              <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} stroke="#f4e6cc" strokeWidth={2.2} strokeLinecap="round" />
              <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} stroke="#f4e6cc" strokeWidth={2.2} strokeLinecap="round" />
            </g>
          )
        }
        if (onToggleString) {
          return (
            <text key={i} x={strX[i]} y={nutY - 5} textAnchor="middle" fill="#6b5744" fontSize={8} style={{ pointerEvents: 'none' }}>
              {STRING_NAMES[i]}
            </text>
          )
        }
        return null
      })}

      {/* Finger dots */}
      {frets.map((fret, i) => {
        if (fret <= 0) return null
        const display = fret - offset
        if (display < 1 || display > FRETS_SHOWN) return null
        const cy = fretY(display - 1) + fretH / 2
        return <circle key={i} cx={strX[i]} cy={cy} r={DOT_R} fill="#f4e6cc" style={onToggleString ? { pointerEvents: 'none' } : undefined} />
      })}

      {/* Chord name */}
      <text x={vW / 2} y={vH - 5} textAnchor="middle" fill="#f4e6cc" fontSize={nameFontSize} fontWeight="bold" fontFamily="'Fraunces', Georgia, serif">
        {chord}
      </text>

      {/* Per-string click targets — one invisible column per string,
          spanning nut to the last fret shown, toggling that string between
          played and muted (×). stopPropagation so a click here doesn't also
          reach a wrapping click handler (there isn't one currently, since
          this only renders inside the chord-tile editor's plain <div>, but
          keeping the diagram self-contained means it stays safe to drop
          into a clickable wrapper later without silently double-firing). */}
      {onToggleString && strX.map((x, i) => (
        <rect
          key={i}
          className="chord-string-hit"
          x={x - 8}
          y={nutY - 4}
          width={16}
          height={fretY(FRETS_SHOWN) - nutY + 4}
          fill="transparent"
          onClick={e => { e.stopPropagation(); onToggleString(i) }}
        >
          <title>{frets[i] === -1 ? `Unmute the ${STRING_NAMES[i]} string` : `Mute the ${STRING_NAMES[i]} string`}</title>
        </rect>
      ))}
    </svg>
  )
}
