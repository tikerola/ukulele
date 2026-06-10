from typing import List


def sync_chords(chords: List[dict], beats: List[float]) -> List[dict]:
    """
    chords: list of {chord, beats} where beats is how many beat slots this chord occupies
    beats: list of beat timestamps from audio analysis
    """
    result = []
    n = len(chords)
    beat_idx = 0
    chord_idx = 0

    while beat_idx < len(beats):
        entry = chords[chord_idx % n]
        result.append({"time": round(beats[beat_idx], 3), "chord": entry["chord"]})
        beat_idx += entry["beats"]
        chord_idx += 1

    return result
