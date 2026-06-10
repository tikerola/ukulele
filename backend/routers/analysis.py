from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from services.youtube import download_audio
from services.beat_tracker import analyze_beats
from services.chord_sync import sync_chords

router = APIRouter()


class ChordInput(BaseModel):
    chord: str
    beats: int


class AnalysisRequest(BaseModel):
    youtube_url: str
    chords: List[ChordInput]
    time_signature: int = 4


class ChordEntry(BaseModel):
    time: float
    chord: str


class AnalysisResponse(BaseModel):
    bpm: float
    beats: List[float]
    chord_timeline: List[ChordEntry]


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest):
    if not request.chords:
        raise HTTPException(status_code=400, detail="Chord list is empty")

    try:
        audio_path = download_audio(request.youtube_url)
        beat_data = analyze_beats(audio_path)
        chord_timeline = sync_chords(
            [{"chord": c.chord, "beats": c.beats} for c in request.chords],
            beat_data["beats"],
        )
        return AnalysisResponse(
            bpm=beat_data["bpm"],
            beats=beat_data["beats"],
            chord_timeline=[ChordEntry(**e) for e in chord_timeline],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
