import os
import sys

# backend/main.py imports its siblings as top-level modules (e.g. `from db import
# init_db`), which is how it runs locally via `cd backend && uvicorn main:app`.
# Put backend/ on sys.path here so the same modules resolve the same way under
# Vercel's Python runtime instead of rewriting those imports to be package-relative.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from main import app  # noqa: E402
