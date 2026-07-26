import json
from typing import Any

from fastapi import APIRouter, HTTPException, Body

from db import get_db
from services.youtube import fetch_video_title

router = APIRouter()


@router.get("/songs")
def list_songs():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT video_id, data, title, updated_at FROM songs ORDER BY updated_at DESC"
            )
            rows = cur.fetchall()

            # Rows saved before `title` existed (or where the lookup failed at
            # save time) — backfill them now so the list only pays the
            # external lookup cost once per song, not on every page load.
            missing = [row for row in rows if not row["title"]]
            for row in missing:
                title = fetch_video_title(row["video_id"])
                if title:
                    cur.execute(
                        "UPDATE songs SET title = %s WHERE video_id = %s",
                        (title, row["video_id"]),
                    )
                    row["title"] = title
        conn.commit()

    return [
        {
            "video_id": row["video_id"],
            "title": row["title"],
            "chords": json.loads(row["data"]).get("chords", []),
            "updated_at": row["updated_at"].isoformat(),
        }
        for row in rows
    ]


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


@router.delete("/songs/{video_id}", status_code=204)
def delete_song(video_id: str):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM songs WHERE video_id = %s", (video_id,))
        conn.commit()


@router.put("/songs/{video_id}", status_code=204)
def save_song(video_id: str, payload: Any = Body(...)):
    with get_db() as conn:
        with conn.cursor() as cur:
            # Creator mode auto-saves on every edit (debounced), so only look
            # the title up once per song rather than on every save.
            cur.execute("SELECT title FROM songs WHERE video_id = %s", (video_id,))
            existing = cur.fetchone()
            title = existing["title"] if existing else None
            if not title:
                title = fetch_video_title(video_id)

            cur.execute(
                """
                INSERT INTO songs (video_id, data, title, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (video_id) DO UPDATE SET
                    data       = EXCLUDED.data,
                    title      = COALESCE(songs.title, EXCLUDED.title),
                    updated_at = EXCLUDED.updated_at
                """,
                (video_id, json.dumps(payload), title),
            )
        conn.commit()
