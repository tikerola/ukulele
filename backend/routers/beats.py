from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from services.youtube import download_audio
from services.beat_tracker import analyze_beats

router = APIRouter()


class BeatsRequest(BaseModel):
    youtube_url: str


class BeatsResponse(BaseModel):
    bpm: float
    beats: List[float]


@router.post("/beats", response_model=BeatsResponse)
async def get_beats(request: BeatsRequest):
    try:
        audio_path = download_audio(request.youtube_url)
        data = analyze_beats(audio_path)
        return BeatsResponse(bpm=round(data["bpm"], 1), beats=data["beats"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
