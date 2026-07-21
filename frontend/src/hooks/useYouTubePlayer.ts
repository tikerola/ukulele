import { useEffect, useRef, useState } from 'react'

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
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
    const lastYTTime = { value: 0, wall: 0 }

    function tick() {
      const ytTime = playerRef.current?.getCurrentTime() ?? 0
      const now = performance.now()

      if (ytTime !== lastYTTime.value) {
        lastYTTime.value = ytTime
        lastYTTime.wall = now
      }

      // Extrapolate, but stop after 350ms without a new YT update (paused/seeking)
      const elapsed = (now - lastYTTime.wall) / 1000
      const predicted = elapsed < 0.35 ? lastYTTime.value + elapsed : lastYTTime.value

      setCurrentTime(predicted)
      setDuration(playerRef.current?.getDuration() ?? 0)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isReady])

  const getTime = () => playerRef.current?.getCurrentTime() ?? 0
  const seekTo = (seconds: number) => playerRef.current?.seekTo(seconds, true)

  return { containerRef, currentTime, duration, isReady, isPlaying, getTime, seekTo }
}
