from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import chords, songs
from db import init_db

app = FastAPI(title="UkeSync API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(chords.router, prefix="/api")
app.include_router(songs.router, prefix="/api")
