import { useCallback, useEffect, useRef, useState } from 'react'

export type RecordingState = 'idle' | 'recording' | 'stopped'

interface UseScreenRecorderResult {
  state: RecordingState
  error: string | null
  downloadUrl: string | null
  // Returns whether recording actually started, so a caller that wants to
  // auto-seek/play the song only does so once there's really something
  // recording it.
  start: (region?: Element | null) => Promise<boolean>
  stop: () => void
  reset: () => void
}

// `CropTarget`/`cropTo` (Region Capture) and `preferCurrentTab` are real,
// shipping Chrome/Edge APIs, but they're recent enough that lib.dom.d.ts
// doesn't type them yet — these augmentations describe just the slice this
// file uses instead of casting to `any` at every call site.
declare global {
  interface Window {
    CropTarget?: { fromElement(element: Element): Promise<unknown> }
  }
  interface MediaStreamTrack {
    cropTo?(cropTarget: unknown): Promise<void>
  }
  interface DisplayMediaStreamOptions {
    // Chrome-only: hints the browser to preselect/streamline sharing the
    // current tab instead of showing the full screen/window/tab picker.
    preferCurrentTab?: boolean
  }
  // Screen Capture API extension — lib.dom.d.ts doesn't have it yet.
  // MediaTrackConstraints inherits from this set, so this is enough to make
  // `video: { cursor: 'never' }` type-check above.
  interface MediaTrackConstraintSet {
    cursor?: ConstrainDOMString
  }
}

// Preferred first — browsers try these in order and use the first one they
// support, so a fresh MediaRecorder always gets a real container/codec
// instead of silently falling back to whatever the empty-options default is.
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type))
}

// Records the browser tab (video + audio) via getDisplayMedia rather than
// touching the YouTube player directly — the iframe is cross-origin, so
// there's no way to read its pixels or audio through canvas/WebAudio. Tab
// capture sidesteps that entirely: it grabs whatever's already on screen,
// which for Playalong (with the video hidden, per its own default) is just
// the static background and the animated chord/lyrics overlay.
export function useScreenRecorder(): UseScreenRecorderResult {
  const [state, setState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Revoke on unmount so navigating away mid-review doesn't leak the blob.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async (region?: Element | null): Promise<boolean> => {
    setError(null)
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
      setDownloadUrl(null)
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // `cursor: 'never'` (Screen Capture API) asks the browser to leave
        // the mouse pointer out of the captured frames entirely — separate
        // from, and a backstop for, the region crop below (which already
        // keeps the pointer out of frame whenever it's over the header,
        // e.g. clicking Stop, since that's outside the cropped area).
        //
        // width/height/frameRate: without an explicit ask, Chrome's tab
        // capture defaults to a downscaled ~720p feed regardless of the
        // tab's actual resolution, as a performance shortcut. These ideals
        // request the full resolution instead — and since Region Capture
        // crops the *already-captured* frame rather than re-capturing at a
        // lower size, capturing at full resolution here also means the
        // cropped-down practice area keeps more of its native sharpness
        // instead of being a crop of an already-shrunk 720p frame.
        video: {
          cursor: 'never',
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 30 },
        },
        // Plain `audio: true` lets the browser apply its default voice-call
        // processing (echo cancellation, noise suppression, auto gain) to
        // the captured tab audio — those are tuned for speech over a mic,
        // and on music they smear the high end into a muffled, "underwater"
        // sound. Explicitly turning them off gets a clean passthrough.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        preferCurrentTab: true,
      })

      const [videoTrack] = stream.getVideoTracks()

      // Region Capture: crops the shared tab's video down to just this
      // element (Playalong's practice area, not the header/controls around
      // it) — best-effort, since it only works when the user actually
      // shared "this tab" and the browser supports it (Chrome/Edge; Firefox
      // and Safari don't yet). Falling through silently just means a
      // full-tab recording, same as before this existed.
      if (region && window.CropTarget && videoTrack?.cropTo) {
        try {
          const cropTarget = await window.CropTarget.fromElement(region)
          await videoTrack.cropTo(cropTarget)
        } catch {
          // Best-effort — keep recording the uncropped tab.
        }
      }

      chunksRef.current = []
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        // Opus's own default bitrate is tuned for speech too (low enough
        // that it can also dull music) — this pushes it up to a level meant
        // for full-range audio.
        audioBitsPerSecond: 256_000,
        // MediaRecorder's own default video bitrate is low enough to blur
        // text edges regardless of the capture resolution above — mostly
        // static, high-contrast content (chord charts, lyrics) compresses
        // very efficiently, so this is generous headroom for crispness
        // rather than a file-size concern.
        videoBitsPerSecond: 8_000_000,
      })

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setDownloadUrl(URL.createObjectURL(blob))
        setState('stopped')
      }

      // The browser's own "Stop sharing" control (on the shared-tab banner)
      // ends the video track without ever calling our stop() — without this,
      // the recorder would keep running with a dead track and never emit a
      // usable file.
      videoTrack?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop()
      })

      recorder.start()
      recorderRef.current = recorder
      setState('recording')
      return true
    } catch (err) {
      setState('idle')
      setError(err instanceof Error ? err.message : 'Could not start recording')
      return false
    }
  }, [downloadUrl])

  const stop = useCallback(() => {
    // Guards against being called after the recorder already stopped itself
    // (e.g. the "Stop sharing" browser control, or an auto-stop effect
    // reacting to the same state change twice) — MediaRecorder throws if
    // stop() is called while already inactive.
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl(null)
    setError(null)
    setState('idle')
  }, [downloadUrl])

  return { state, error, downloadUrl, start, stop, reset }
}
