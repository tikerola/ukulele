// Kuvionuotti (Figurenotes) color scheme, ported from the UG project — color is
// determined by the chord's root note letter only. Quality (m/7/maj7/sus/etc.)
// and accidentals (# or b collapse to the natural letter's color) don't change it.
const KUVIONUOTTI: Record<string, string> = {
  C: '#D32F2F', // Red
  D: '#6D4C41', // Brown
  E: '#9E9E9E', // Grey
  F: '#1976D2', // Blue
  G: '#212121', // Black
  A: '#F9A825', // Yellow
  B: '#388E3C', // Green
}

function parseRoot(chord: string): string {
  if (chord.length >= 2 && (chord[1] === '#' || chord[1] === 'b')) return chord.slice(0, 2)
  return chord.slice(0, 1)
}

export function getNoteColor(note: string): string {
  const base = note[0]?.toUpperCase() ?? ''
  return KUVIONUOTTI[base] ?? '#555555'
}

export function getChordColor(chordName: string): string {
  const root = parseRoot(chordName)
  return getNoteColor(root)
}
