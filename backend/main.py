from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import analysis, chords, tempo, beats

app = FastAPI(title="UkeSync API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router, prefix="/api")
app.include_router(chords.router, prefix="/api")
app.include_router(tempo.router, prefix="/api")
app.include_router(beats.router, prefix="/api")
