interface Props {
  currentTime: number
  bpm: number
  phaseTime: number
  beatsPerBar?: number
}

export function BeatIndicator({ currentTime, bpm, phaseTime, beatsPerBar = 4 }: Props) {
  if (bpm <= 0) return null

  const beatDur = 60 / bpm
  const elapsed = currentTime - phaseTime
  const beat = elapsed >= 0 ? Math.floor(elapsed / beatDur) : -1
  const beatInBar = beat >= 0 ? ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar : -1
  const decay = elapsed >= 0 ? 1 - (elapsed % beatDur) / beatDur : 0

  return (
    <div className="beat-indicator">
      {Array.from({ length: beatsPerBar }, (_, i) => {
        const isActive = i === beatInBar
        const isDown = i === 0
        const scale = isActive ? 1 + decay * (isDown ? 0.55 : 0.35) : 1
        const opacity = isActive ? 0.35 + decay * 0.65 : 0.18
        return (
          <div
            key={i}
            className={`beat-dot${isDown ? ' beat-dot-down' : ''}`}
            style={{ transform: `scale(${scale})`, opacity }}
          />
        )
      })}
    </div>
  )
}
