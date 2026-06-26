from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from services.youtube import download_audio
from services.beat_tracker import analyze_beats

router = APIRouter()


class BeatsRequest(BaseModel):
    youtube_url: str
    chords: List[str] = []


class ChordChange(BaseModel):
    beat: int
    chord: str


class BeatsResponse(BaseModel):
    bpm: float
    beats: List[float]
    meter: int
    chord_changes: List[ChordChange] = []
    section_boundaries: List[int] = []


@router.post("/beats", response_model=BeatsResponse)
async def get_beats(request: BeatsRequest):
    try:
        audio_path = download_audio(request.youtube_url)
        data = analyze_beats(audio_path, chord_names=request.chords or None)
        return BeatsResponse(
            bpm=round(data["bpm"], 1),
            beats=data["beats"],
            meter=data["meter"],
            chord_changes=[ChordChange(**c) for c in data["chord_changes"]],
            section_boundaries=data.get("section_boundaries", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
