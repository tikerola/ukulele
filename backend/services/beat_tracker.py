from typing import Optional
import numpy as np
import librosa
from services.chord_recognizer import guess_chord_changes


def detect_meter(y, sr, beat_frames, onset_env=None) -> tuple[int, int]:
    """
    Estimate beats-per-bar (3 or 4) and downbeat phase offset from onset strength.
    Returns (meter, downbeat_offset) where downbeat_offset is the index within each
    bar group at which the strongest beats fall.
    """
    if len(beat_frames) < 12:
        return 4, 0

    if onset_env is None:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    valid = beat_frames[beat_frames < len(onset_env)]
    if len(valid) < 12:
        return 4, 0

    strengths = onset_env[valid].astype(float)
    peak = strengths.max()
    if peak > 0:
        strengths /= peak

    best_meter, best_ratio, best_offset = 4, 0.0, 0

    for meter in [3, 4]:
        for offset in range(meter):
            db_idx = list(range(offset, len(strengths), meter))
            other_idx = [i for i in range(len(strengths)) if i % meter != offset]
            if not db_idx or not other_idx:
                continue
            db_mean = float(np.mean(strengths[db_idx]))
            other_mean = float(np.mean(strengths[other_idx]))
            if other_mean > 0:
                ratio = db_mean / other_mean
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_meter = meter
                    best_offset = offset

    return best_meter, best_offset


def detect_section_boundaries(y, sr, beat_frames, hop: int = 512, meter: int = 4) -> list[int]:
    """
    Return 0-based bar indices where a new structural section likely starts.
    Uses beat-synced MFCC novelty: peaks in frame-to-frame distance signal
    transitions between sections.
    """
    if len(beat_frames) < meter * 4:
        return []

    try:
        from scipy.ndimage import gaussian_filter1d
        from scipy.signal import find_peaks
    except ImportError:
        return []

    # Beat-synced MFCC
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=12, hop_length=hop)
    beat_mfcc = librosa.util.sync(mfcc, beat_frames, aggregate=np.median)
    beat_mfcc = librosa.util.normalize(beat_mfcc, norm=2, axis=0)

    # Novelty: Euclidean distance between adjacent beat frames
    diff = np.sqrt(np.sum(np.diff(beat_mfcc, axis=1) ** 2, axis=0))
    if len(diff) == 0:
        return []

    # Smooth over ~1 bar to reduce beat-level noise
    smoothed = gaussian_filter1d(diff.astype(float), sigma=float(meter))

    # Peaks must be at least 4 bars apart and above the 65th percentile
    min_dist = max(1, 4 * meter)
    threshold = float(np.percentile(smoothed, 65))
    peaks, _ = find_peaks(smoothed, distance=min_dist, height=threshold)

    # Round each peak beat to the nearest bar boundary
    total_bars = len(beat_frames) // meter
    bar_indices = set()
    for p in peaks:
        bar = int(round(float(p) / meter))
        if 0 < bar < total_bars:
            bar_indices.add(bar)

    return sorted(bar_indices)


def analyze_beats(audio_path: str, chord_names: Optional[list] = None) -> dict:
    y, sr = librosa.load(audio_path, sr=None, mono=True)

    hop = 512
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)

    # Lower tightness (50 vs default 100) lets beats follow local rhythmic changes
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=hop, tightness=50
    )

    # Snap each beat to the nearest onset within a 100 ms window
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=hop
    )
    if len(onset_frames) > 0:
        tol = max(1, int(0.1 * sr / hop))
        snapped, seen = [], set()
        for bf in beat_frames:
            dists = np.abs(onset_frames.astype(int) - int(bf))
            j = int(np.argmin(dists))
            candidate = int(onset_frames[j]) if dists[j] <= tol else int(bf)
            if candidate not in seen:
                seen.add(candidate)
                snapped.append(candidate)
        beat_frames = np.array(snapped, dtype=int)

    # Detect meter and downbeat phase; shift grid so bar starts are at index 0
    meter, downbeat_offset = detect_meter(y, sr, beat_frames, onset_env=onset_env)
    if downbeat_offset > 0 and len(beat_frames) > downbeat_offset:
        beat_frames = beat_frames[downbeat_offset:]

    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    result = {
        "bpm": float(tempo),
        "beats": beat_times,
        "meter": meter,
        "chord_changes": [],
        "section_boundaries": detect_section_boundaries(y, sr, beat_frames, hop=hop, meter=meter),
    }

    if chord_names:
        result["chord_changes"] = guess_chord_changes(y, sr, beat_frames, chord_names, meter=meter)

    return result


def detect_tempo(audio_path: str, max_duration: float = 60.0) -> float:
    y, sr = librosa.load(audio_path, sr=None, mono=True, duration=max_duration)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo)
