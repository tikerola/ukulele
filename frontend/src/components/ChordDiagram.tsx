import { useId } from 'react'
import type { ChordData } from '../types'
import { getChordColor } from '../lib/chordColors'

interface Props {
  chord: string
  data: ChordData | null
  size?: number
  accentHeight?: number
  nameFontSize?: number
}

const STRINGS = 4
const FRETS_SHOWN = 4

export function ChordDiagram({ chord, data, size = 1, accentHeight = 10, nameFontSize = 10 }: Props) {
  const vW = 90
  // Chord-name row grows with nameFontSize so a bigger label never overlaps the fretboard.
  const vH = 105 + nameFontSize
  const W = vW * size
  const H = vH * size

  const strX = [21, 37, 53, 69]
  const nutY = 26
  const fretH = 18
  const fretY = (f: number) => nutY + fretH * f
  const topY = 10

  const color = getChordColor(chord)
  const clipId = `chord-card-${useId().replace(/:/g, '')}`

  if (!data) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${vW} ${vH}`}>
        <defs>
          <clipPath id={clipId}><rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} /></clipPath>
        </defs>
        <rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} fill="#1e2433" stroke="#3d4560" />
        <rect x={1} y={1} width={vW - 2} height={accentHeight} fill={color} stroke="#e6edf3" strokeOpacity={0.5} clipPath={`url(#${clipId})`} />
        <text x={vW / 2} y={vH / 2 + 5} textAnchor="middle" fill="#666" fontSize={14}>?</text>
        <text x={vW / 2} y={vH - 5} textAnchor="middle" fill="#7d8590" fontSize={nameFontSize - 1}>{chord}</text>
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
      <rect x={1} y={1} width={vW - 2} height={vH - 2} rx={6} fill="#1e2433" stroke="#3d4560" />
      <rect x={1} y={1} width={vW - 2} height={accentHeight} fill={color} stroke="#e6edf3" strokeOpacity={0.5} clipPath={`url(#${clipId})`} />

      {/* Nut */}
      {offset === 0
        ? <rect x={strX[0]} y={nutY - 3} width={strX[STRINGS - 1] - strX[0]} height={3} fill="#c9d1d9" />
        : <text x={strX[STRINGS - 1] + 6} y={nutY + fretH * 0.6} fontSize={8} fill="#7d8590">{offset + 1}fr</text>
      }

      {/* Fret lines */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <line key={i}
          x1={strX[0]} y1={fretY(i)}
          x2={strX[STRINGS - 1]} y2={fretY(i)}
          stroke="#3d4560" strokeWidth={1}
        />
      ))}

      {/* String lines */}
      {strX.map((x, i) => (
        <line key={i}
          x1={x} y1={nutY}
          x2={x} y2={fretY(FRETS_SHOWN)}
          stroke="#8b949e" strokeWidth={1.2}
        />
      ))}

      {/* Muted string indicators */}
      {frets.map((fret, i) => {
        if (fret === -1) {
          return (
            <text key={i} x={strX[i]} y={topY + 4} textAnchor="middle" fill="#8b949e" fontSize={10}>×</text>
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
        return <circle key={i} cx={strX[i]} cy={cy} r={7} fill="#58a6ff" />
      })}

      {/* Chord name */}
      <text x={vW / 2} y={vH - 5} textAnchor="middle" fill="#e6edf3" fontSize={nameFontSize} fontWeight="bold">
        {chord}
      </text>
    </svg>
  )
}
