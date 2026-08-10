import { useEffect, useRef, useState } from 'react'

// Mirrors useYouTubePlayer's shape (currentTime/duration/isReady/isPlaying/
// seekTo/play/pause) so PlayalongView can swap between the two without
// touching any of the chord-sync, recording, or transport code that
// consumes them — only which hook feeds those fields changes. Simpler than
// useYouTubePlayer's own tick loop: a real <audio> element's currentTime is
// exact and free to read synchronously, unlike the YouTube IFrame API's
// ~4x/sec getCurrentTime() polling, which needs interpolation to look
// smooth.
export function useAudioFilePlayer(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef<number>(0)
  const urlRef = useRef<string | null>(null)

  // Swaps in a fresh object URL whenever the file changes, and revokes the
  // previous one — object URLs otherwise leak for the life of the page.
  useEffect(() => {
    setIsReady(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    const el = audioRef.current
    if (!file || !el) return
    const url = URL.createObjectURL(file)
    urlRef.current = url
    el.src = url
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [file])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onLoaded = () => { setIsReady(true); setDuration(el.duration || 0) }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [file])

  useEffect(() => {
    if (!isReady) return
    function tick() {
      setCurrentTime(audioRef.current?.currentTime ?? 0)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isReady])

  const seekTo = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
  }
  const play = () => { audioRef.current?.play() }
  const pause = () => audioRef.current?.pause()

  return { audioRef, currentTime, duration, isReady, isPlaying, seekTo, play, pause }
}
