import yt_dlp
import imageio_ffmpeg
import subprocess
import tempfile
import os


def download_audio(youtube_url: str) -> str:
    tmpdir = tempfile.mkdtemp()
    output_template = os.path.join(tmpdir, "audio.%(ext)s")

    # Download raw audio stream — no postprocessor, no ffprobe needed
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        ext = info.get("ext", "m4a")

    src = os.path.join(tmpdir, f"audio.{ext}")
    wav = os.path.join(tmpdir, "audio.wav")

    # Convert to mono WAV using the bundled ffmpeg binary
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-i", src, "-vn", "-ac", "1", "-ar", "44100", wav],
        check=True,
        capture_output=True,
    )

    return wav
