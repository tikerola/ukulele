import librosa


def analyze_beats(audio_path: str) -> dict:
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    return {
        "bpm": float(tempo),
        "beats": beat_times,
    }


def detect_tempo(audio_path: str, max_duration: float = 60.0) -> float:
    y, sr = librosa.load(audio_path, sr=None, mono=True, duration=max_duration)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo)
