import json
from typing import Any

from fastapi import APIRouter, HTTPException, Body

from db import get_db

router = APIRouter()


@router.get("/songs/{video_id}")
def get_song(video_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT data FROM songs WHERE video_id = %s", (video_id,)
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return json.loads(row["data"])


@router.put("/songs/{video_id}", status_code=204)
def save_song(video_id: str, payload: Any = Body(...)):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO songs (video_id, data, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (video_id) DO UPDATE SET
                    data       = EXCLUDED.data,
                    updated_at = EXCLUDED.updated_at
                """,
                (video_id, json.dumps(payload)),
            )
        conn.commit()
