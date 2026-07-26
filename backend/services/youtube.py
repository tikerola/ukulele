import json
import urllib.parse
import urllib.request

_OEMBED_URL = "https://www.youtube.com/oembed"
_TIMEOUT_SECONDS = 3


def fetch_video_title(video_id: str) -> str | None:
    """Looks up a YouTube video's title via the public oEmbed endpoint.
    Returns None on any failure (private/deleted video, network issue, etc.)
    so callers can fall back to showing the video ID instead.
    """
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    query = urllib.parse.urlencode({"url": watch_url, "format": "json"})
    try:
        with urllib.request.urlopen(f"{_OEMBED_URL}?{query}", timeout=_TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read())
        return data.get("title")
    except Exception:
        return None
