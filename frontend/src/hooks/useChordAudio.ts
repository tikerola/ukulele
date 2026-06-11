import { useRef, useCallback } from 'react'

// GCEA open-string MIDI notes: [G4=67, C4=60, E4=64, A4=69]
const OPEN_MIDI = [67, 60, 64, 69]

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function useChordAudio() {
  const ctxRef = useRef<AudioContext | null>(null)

  function getCtx(): AudioContext {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }

  const playChord = useCallback((frets: [number, number, number, number]) => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime

    frets.forEach((fret, i) => {
      if (fret < 0) return

      const freq = midiToFreq(OPEN_MIDI[i] + fret)
      const strumDelay = i * 0.013

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'triangle'
      osc.frequency.value = freq

      gain.gain.setValueAtTime(0, now + strumDelay)
      gain.gain.linearRampToValueAtTime(0.18, now + strumDelay + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + strumDelay + 1.8)

      osc.start(now + strumDelay)
      osc.stop(now + strumDelay + 1.9)
    })
  }, [])

  return { playChord }
}
