import re
from collections import Counter
import numpy as np
import librosa

# Semitone offset for each root name
_ROOT_PC: dict[str, int] = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}

# Intervals (semitones from root) for each chord quality
_QUALITY_IVS: dict[str, list[int]] = {
    '':      [0, 4, 7],
    'm':     [0, 3, 7],
    '7':     [0, 4, 7, 10],
    'maj7':  [0, 4, 7, 11],
    'm7':    [0, 3, 7, 10],
    'sus2':  [0, 2, 7],
    'sus4':  [0, 5, 7],
    'dim':   [0, 3, 6],
    'dim7':  [0, 3, 6, 9],
    'aug':   [0, 4, 8],
    'add9':  [0, 2, 4, 7],
    '6':     [0, 4, 7, 9],
    'm6':    [0, 3, 7, 9],
    'm7b5':  [0, 3, 6, 10],
}

_CHORD_RE = re.compile(r'^([A-G][#b]?)(.*)$')


def _chroma_template(chord_name: str) -> np.ndarray:
    """Return a normalised 12-dim chroma template for a chord name."""
    m = _CHORD_RE.match(chord_name)
    if not m:
        return np.ones(12) / 12
    root, quality = m.group(1), m.group(2)
    root_pc = _ROOT_PC.get(root)
    if root_pc is None:
        return np.ones(12) / 12
    ivs = _QUALITY_IVS.get(quality, _QUALITY_IVS[''])
    t = np.zeros(12)
    for iv in ivs:
        t[(root_pc + iv) % 12] = 1.0
    s = t.sum()
    return t / s if s else t


def guess_chord_changes(
    y: np.ndarray,
    sr: int,
    beat_frames: np.ndarray,
    chord_names: list[str],
    meter: int = 4,
) -> list[dict]:
    """
    Assign a chord from chord_names to each beat using CQT chroma similarity,
    then return only the change points as [{beat: int, chord: str}, ...].

    Uses the same hop_length (512) as librosa.beat.beat_track so beat_frames
    can be used directly as column indices into the chroma matrix.
    """
    if not chord_names or len(beat_frames) == 0:
        return []

    hop = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    n_cols = chroma.shape[1]

    # Template matrix: (N_chords, 12)
    templates = np.stack([_chroma_template(c) for c in chord_names])

    # Clamp beat frames to chroma range
    frames = np.clip(beat_frames, 0, n_cols - 1)

    # Average chroma over each beat's full duration (frame[i] → frame[i+1])
    beat_chromas = []
    for i, f in enumerate(frames):
        end = int(frames[i + 1]) if i + 1 < len(frames) else f + 4
        end = min(end, n_cols)
        seg = chroma[:, int(f):end] if end > f else chroma[:, int(f): int(f) + 1]
        beat_chromas.append(seg.mean(axis=1))
    beat_chromas = np.array(beat_chromas)          # (B, 12)

    # Cosine similarity between each beat and each template
    norms = np.linalg.norm(beat_chromas, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    scores = (beat_chromas / norms) @ templates.T  # (B, N)
    best = np.argmax(scores, axis=1).tolist()       # list of chord indices

    # Denoise: remove isolated single-beat mis-classifications
    for i in range(1, len(best) - 1):
        if best[i] != best[i - 1] and best[i] != best[i + 1]:
            best[i] = best[i - 1]

    # Aggregate to bar level: majority-vote chord per bar, reported at bar start.
    # This makes placement grid-aligned regardless of the beat tracker's phase offset.
    num_beats = len(best)
    changes: list[dict] = []
    prev = -1

    for bar_start in range(0, num_beats, meter):
        bar_slice = best[bar_start: bar_start + meter]
        dominant = Counter(bar_slice).most_common(1)[0][0]
        if dominant != prev:
            changes.append({"beat": bar_start, "chord": chord_names[dominant]})
            prev = dominant

    return changes
