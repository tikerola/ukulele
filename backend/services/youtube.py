import sys
import yt_dlp
import imageio_ffmpeg
import subprocess
import tempfile
import os

_BROWSER_DIRS: dict[str, str] = {}
if sys.platform == "win32":
    _lad = os.environ.get("LOCALAPPDATA", "")
    _adr = os.environ.get("APPDATA", "")
    _BROWSER_DIRS = {
        "chrome":  os.path.join(_lad, "Google", "Chrome", "User Data"),
        "edge":    os.path.join(_lad, "Microsoft", "Edge", "User Data"),
        "brave":   os.path.join(_lad, "BraveSoftware", "Brave-Browser", "User Data"),
        "opera":   os.path.join(_adr, "Opera Software", "Opera Stable"),
        "firefox": os.path.join(_adr, "Mozilla", "Firefox", "Profiles"),
    }
elif sys.platform == "darwin":
    _home = os.path.expanduser("~")
    _BROWSER_DIRS = {
        "chrome":  os.path.join(_home, "Library", "Application Support", "Google", "Chrome"),
        "edge":    os.path.join(_home, "Library", "Application Support", "Microsoft Edge"),
        "brave":   os.path.join(_home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
        "firefox": os.path.join(_home, "Library", "Application Support", "Firefox", "Profiles"),
    }
else:
    _home = os.path.expanduser("~")
    _BROWSER_DIRS = {
        "chrome":   os.path.join(_home, ".config", "google-chrome"),
        "chromium": os.path.join(_home, ".config", "chromium"),
        "edge":     os.path.join(_home, ".config", "microsoft-edge"),
        "brave":    os.path.join(_home, ".config", "BraveSoftware", "Brave-Browser"),
        "firefox":  os.path.join(_home, ".mozilla", "firefox"),
    }

# (format_string, extractor_args) — tried in order, most capable first
_STRATEGIES = [
    # Default web client — widest format selection
    ("bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best", {}),
    # iOS client — works for some age/region-restricted videos
    ("bestaudio[ext=m4a]/bestaudio/best", {"youtube": {"player_client": ["ios"]}}),
    # tv_embedded — bypasses some bot checks but only muxed streams available
    ("best[ext=mp4]/best", {"youtube": {"player_client": ["tv_embedded"]}}),
]


def _installed_browsers() -> list[str]:
    return [b for b, d in _BROWSER_DIRS.items() if os.path.isdir(d)]


def _ydl_opts(output_template: str, fmt: str, extractor_args: dict, browser: str | None) -> dict:
    opts: dict = {
        "format": fmt,
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }
    if extractor_args:
        opts["extractor_args"] = extractor_args
    if browser:
        opts["cookiesfrombrowser"] = (browser,)
    return opts


def download_audio(youtube_url: str) -> str:
    tmpdir = tempfile.mkdtemp()
    output_template = os.path.join(tmpdir, "audio.%(ext)s")
    browsers = [None] + _installed_browsers()

    last_exc: Exception = RuntimeError("No download attempts were made")

    for fmt, extractor_args in _STRATEGIES:
        for browser in browsers:
            try:
                opts = _ydl_opts(output_template, fmt, extractor_args, browser)
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(youtube_url, download=True)
                    ext = info.get("ext", "m4a")
                # Success — skip remaining attempts
                break
            except Exception as exc:
                last_exc = exc
                for f in os.listdir(tmpdir):
                    try:
                        os.remove(os.path.join(tmpdir, f))
                    except OSError:
                        pass
        else:
            # All browsers failed for this strategy — try next strategy
            continue
        # Inner loop broke (success) — exit outer loop too
        break
    else:
        raise last_exc

    src = os.path.join(tmpdir, f"audio.{ext}")
    wav = os.path.join(tmpdir, "audio.wav")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-i", src, "-vn", "-ac", "1", "-ar", "44100", wav],
        check=True,
        capture_output=True,
    )

    return wav
