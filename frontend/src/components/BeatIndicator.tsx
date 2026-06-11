interface Props {
  currentTime: number
  bpm: number
  phaseTime: number
  beatsPerBar?: number
  chordEventTimes: number[]
}

export function BeatIndicator({ currentTime, bpm, phaseTime, beatsPerBar = 4, chordEventTimes }: Props) {
  if (bpm <= 0) return null

  const beatDur = 60 / bpm

  // Find last chord event that has fired
  let lastIdx = chordEventTimes.length - 1
  while (lastIdx >= 0 && chordEventTimes[lastIdx] > currentTime) lastIdx--

  const lastEventTime = lastIdx >= 0 ? chordEventTimes[lastIdx] : -1
  const timeSince = lastEventTime >= 0 ? currentTime - lastEventTime : Infinity
  const decay = timeSince < beatDur ? 1 - timeSince / beatDur : 0

  // Which beat-in-bar did the last event land on?
  const lastBeatInBar = lastEventTime >= 0
    ? (((Math.floor((lastEventTime - phaseTime) / beatDur) % beatsPerBar) + beatsPerBar) % beatsPerBar)
    : -1

  // Which beat-in-bar positions have any chord events in the song?
  const eventPositions = new Set(
    chordEventTimes.map(t => {
      const b = Math.floor((t - phaseTime) / beatDur)
      return ((b % beatsPerBar) + beatsPerBar) % beatsPerBar
    })
  )

  return (
    <div className="beat-indicator">
      {Array.from({ length: beatsPerBar }, (_, i) => {
        const isActive = i === lastBeatInBar
        const hasEvents = eventPositions.has(i)
        const isDown = i === 0

        if (!hasEvents) {
          return (
            <div
              key={i}
              className={`beat-dot beat-dot-muted${isDown ? ' beat-dot-down' : ''}`}
              style={{ transform: 'scale(1)', opacity: 0.06 }}
            />
          )
        }

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
