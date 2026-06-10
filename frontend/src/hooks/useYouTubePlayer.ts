import { useEffect, useRef, useState } from 'react'

interface YTPlayer {
  getCurrentTime(): number
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
    }
  }, [videoId])

  useEffect(() => {
    if (!isReady) return
    function tick() {
      setCurrentTime(playerRef.current?.getCurrentTime() ?? 0)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isReady])

  const getTime = () => playerRef.current?.getCurrentTime() ?? 0

  return { containerRef, currentTime, isReady, isPlaying, getTime }
}
