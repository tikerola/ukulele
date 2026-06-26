import json
from typing import Any

from fastapi import APIRouter, HTTPException, Body

from db import get_db

router = APIRouter()


@router.get("/songs/{video_id}")
def get_song(video_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT data FROM songs WHERE video_id = ?", (video_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return json.loads(row["data"])


@router.put("/songs/{video_id}", status_code=204)
def save_song(video_id: str, payload: Any = Body(...)):
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO songs (video_id, data, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(video_id) DO UPDATE SET
                data       = excluded.data,
                updated_at = excluded.updated_at
            """,
            (video_id, json.dumps(payload)),
        )
        conn.commit()
