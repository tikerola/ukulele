import { useEffect, useRef, useState } from 'react'

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  destroy(): void
}

interface YTPlayerOptions {
  videoId: string
  playerVars?: Record<string, number>
  events?: {
    onReady?: () => void
    onStateChange?: (e: { data: number }) => void
  }
}

declare global {
  interface Window {
    YT: { Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer }
    onYouTubeIframeAPIReady: () => void
  }
}

let scriptInserted = false
const pendingCallbacks: (() => void)[] = []

function whenYTReady(cb: () => void) {
  if (window.YT?.Player) {
    cb()
    return
  }
  pendingCallbacks.push(cb)
  if (scriptInserted) return
  scriptInserted = true
  window.onYouTubeIframeAPIReady = () => {
    pendingCallbacks.splice(0).forEach(fn => fn())
  }
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(tag)
}

export function useYouTubePlayer(videoId: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number>(0)
  // Shared between the tick loop and seekTo (see below) — a plain ref
  // rather than a local var inside the tick effect, since seekTo needs to
  // reset it too.
  const lastYTTimeRef = useRef({ value: 0, wall: 0 })
  // Set by seekTo while a seek is in flight; cleared once getCurrentTime()
  // actually confirms it. While set, the tick loop ignores whatever
  // getCurrentTime() reports (it's still the *pre-seek* position for up to
  // ~250ms — YouTube's own update cadence) instead of letting that stale
  // value overwrite the optimistic jump seekTo already made, which would
  // otherwise show the playhead snapping to the clicked position for one
  // frame and then regressing back to the old one until the real seek
  // catches up.
  const seekTargetRef = useRef<number | null>(null)
  // Mirrors isPlaying for the tick loop below (a plain state value would be
  // stale in that closure, since the loop's effect only depends on
  // isReady).
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  useEffect(() => {
    let cancelled = false

    whenYTReady(() => {
      if (cancelled || !containerRef.current) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0 },
        events: {
          onReady: () => { if (!cancelled) setIsReady(true) },
          onStateChange: (e: { data: number }) => {
            if (!cancelled) setIsPlaying(e.data === 1)
          },
        },
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      playerRef.current?.destroy()
      playerRef.current = null
      setIsReady(false)
      setIsPlaying(false)
      setDuration(0)
    }
  }, [videoId])

  useEffect(() => {
    if (!isReady) return

    // YouTube's getCurrentTime() updates ~4x/sec, not every frame.
    // We interpolate between updates using wall-clock time so the pulse
    // fires at the actual beat rather than up to ~250ms late.
    function tick() {
      let ytTime = playerRef.current?.getCurrentTime() ?? 0
      const now = performance.now()

      if (seekTargetRef.current !== null) {
        if (Math.abs(ytTime - seekTargetRef.current) < 0.3) {
          seekTargetRef.current = null // player has caught up — resume normal tracking
        } else {
          ytTime = lastYTTimeRef.current.value // still stale — ignore it, keep the optimistic anchor
        }
      }

      if (ytTime !== lastYTTimeRef.current.value) {
        lastYTTimeRef.current = { value: ytTime, wall: now }
      }

      // Only extrapolate forward — to smooth over YouTube's ~4x/sec
      // getCurrentTime() polling — while we're confident playback is
      // actually running *and* any pending seek has been confirmed.
      // Without the isPlaying check, a seek that lands the player in a
      // buffering state (common right after seeking, even briefly) still
      // looked like "no update in a while," which this code used to read
      // as "assume it's playing and keep coasting forward" — visibly
      // drifting the displayed position past the seek target until the
      // real, stationary value caught up and snapped it back. Without the
      // seekTargetRef check, a still-unconfirmed seek would similarly get
      // read as "paused," letting a stale pre-seek value stand instead of
      // holding at the target.
      let predicted = lastYTTimeRef.current.value
      if (isPlayingRef.current && seekTargetRef.current === null) {
        const elapsed = (now - lastYTTimeRef.current.wall) / 1000
        predicted = elapsed < 0.35 ? lastYTTimeRef.current.value + elapsed : lastYTTimeRef.current.value
      }

      setCurrentTime(predicted)
      setDuration(playerRef.current?.getDuration() ?? 0)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isReady])

  const getTime = () => playerRef.current?.getCurrentTime() ?? 0
  // Jumps currentTime (and the tick loop's tracking anchor) to the target
  // immediately, and arms seekTargetRef so the tick loop ignores
  // getCurrentTime() until it actually confirms the seek — without both of
  // these, the displayed position kept interpolating forward from the
  // *pre-seek* position for up to ~250ms after a click (getCurrentTime()
  // only updates ~4x/sec), which read as the playhead drifting before
  // snapping to where it was actually clicked instead of landing there
  // right away.
  const seekTo = (seconds: number) => {
    playerRef.current?.seekTo(seconds, true)
    lastYTTimeRef.current = { value: seconds, wall: performance.now() }
    seekTargetRef.current = seconds
    setCurrentTime(seconds)
  }
  const play = () => playerRef.current?.playVideo()
  const pause = () => playerRef.current?.pauseVideo()

  return { containerRef, currentTime, duration, isReady, isPlaying, getTime, seekTo, play, pause }
}
