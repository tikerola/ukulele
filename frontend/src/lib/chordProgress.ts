// Restarts a chord card's progress-bar CSS animation so it drains from "now"
// to `endTime`, accounting for time already elapsed since `startTime` (e.g.
// a seek mid-chord) via a negative animation-delay. Shared by ChordOverlay
// and SectionChordBoard, which both mark the active card the same way and
// need the same reflow-then-restart idiom the beat-pulse animation uses.
export function restartChordProgress(
  cardEl: HTMLElement | null | undefined,
  startTime: number,
  endTime: number | null,
  currentTime: number,
) {
  const track = cardEl?.querySelector<HTMLElement>('.chord-progress-track')
  const fill = cardEl?.querySelector<HTMLElement>('[data-progress-fill]')
  if (!track || !fill) return

  // No next chord to count down to (the last chord of the whole timeline) —
  // hide the bar outright rather than leave it static and full.
  const duration = endTime !== null ? endTime - startTime : 0
  if (endTime === null || duration <= 0) {
    track.style.visibility = 'hidden'
    fill.classList.remove('run')
    return
  }

  track.style.visibility = ''
  const elapsed = Math.max(0, Math.min(duration, currentTime - startTime))
  fill.style.setProperty('--dur', `${duration}s`)
  fill.style.setProperty('--elapsed', `${elapsed}s`)
  fill.classList.remove('run')
  void fill.offsetWidth
  fill.classList.add('run')
}
