from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.youtube import download_audio
from services.beat_tracker import detect_tempo

router = APIRouter()


class TempoRequest(BaseModel):
    youtube_url: str


class TempoResponse(BaseModel):
    bpm: float


@router.post("/tempo", response_model=TempoResponse)
async def get_tempo(request: TempoRequest):
    try:
        audio_path = download_audio(request.youtube_url)
        bpm = detect_tempo(audio_path)
        return TempoResponse(bpm=round(bpm, 1))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
