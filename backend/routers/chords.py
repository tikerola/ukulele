import json
import os
from fastapi import APIRouter

router = APIRouter()

_CHORDS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "chords.json")

with open(_CHORDS_PATH) as f:
    _CHORD_DATA = json.load(f)


@router.get("/chords")
async def get_chords():
    return _CHORD_DATA
