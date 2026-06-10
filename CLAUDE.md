# CLAUDE.md

## Project Overview

Build an application called **UkeSync** that generates playalong videos for ukulele players.

The user provides:

- A YouTube video URL.
- The chord progression of the song.
- The ukulele tuning (default: GCEA).
- Optional song metadata (title, artist, capo position).

The application automatically analyzes the song's rhythmic structure, aligns the provided chords with the beat grid, and generates a video overlay containing animated ukulele chord diagrams synchronized to the music.

The goal is to create a smooth user experience where musicians can generate practice videos in a few minutes.

---

# Product Goals

The generated video should allow a ukulele player to:

- Watch the original performance.
- See the current chord displayed as a ukulele chord chart.
- Anticipate upcoming chord changes.
- Feel the beat through subtle visual animation.
- Practice along with the recording.

---

# MVP Features

## Input

User provides:

1. YouTube URL.
2. Chord progression.
3. Time signature.
4. Number of beats per chord.

Example:

```
Time Signature: 4/4
Beats per chord: 4

G | Em | C | D
G | Em | C | D
```

---

## Audio Analysis

Extract audio from the YouTube source.

Detect:

- Tempo (BPM)
- Beat positions
- Downbeats

Suggested libraries:

- librosa
- madmom
- essentia

Output example:

```json
{
  "bpm": 126,
  "beats": [0.48, 0.96, 1.43, 1.9]
}
```

---

# Chord Synchronization

## Automatic Mapping

Given:

```
Chord sequence:
G Em C D
```

and

```
Beats per chord:
4
```

assign each chord to consecutive downbeats.

Example:

```
0.0   G
1.9   Em
3.8   C
5.7   D
```

---

## Adjustment UI

Provide an editor allowing the user to:

- Move chord boundaries.
- Insert missing chord changes.
- Delete incorrect chord placements.
- Preview synchronization in real time.

Changes should immediately update playback.

---

# Ukulele Chord Engine

Maintain a chord dictionary containing fingering information.

Example:

```json
{
  "G": {
    "frets": [0, 2, 3, 2]
  },
  "C": {
    "frets": [0, 0, 0, 3]
  }
}
```

Support:

- Major chords
- Minor chords
- Seventh chords
- Suspended chords
- Major seventh chords

Future versions may support custom fingerings.

---

# Video Overlay Design

Display:

Current chord:

```
┌───────────┐
│     G     │
│           │
│ o     o   │
│   o       │
│     o     │
└───────────┘
```

Upcoming chords:

```
Current:  G
Next:     Em → C → D
```

---

# Beat Animation

During playback:

- The active chord diagram should pulse slightly on each beat.
- The pulse should be stronger on the downbeat.
- The chord name should transition smoothly when changing.

Animation goals:

- Minimal distraction.
- Clear rhythmic guidance.
- Easy readability on mobile devices.

---

# Rendering Pipeline

1. Download or access source media.
2. Extract audio.
3. Perform beat tracking.
4. Synchronize chords.
5. Generate overlay frames.
6. Composite overlay onto source video.
7. Export final MP4.

Suggested tools:

- FFmpeg
- MoviePy
- Remotion (web alternative)

---

# Architecture

Frontend:

- React
- TypeScript

Backend:

- Python
- FastAPI

Media Processing:

- FFmpeg
- librosa
- madmom

Storage:

- Local filesystem for MVP.

---

# User Workflow

Step 1:

Paste YouTube URL.

Step 2:

Paste chord progression.

Step 3:

Specify:

- Time signature.
- Beats per chord.

Step 4:

System detects BPM and beat locations.

Step 5:

User reviews synchronization.

Step 6:

User adjusts any incorrect chord placements.

Step 7:

Generate playalong video.

---

# Success Criteria

A new user should be able to generate a synchronized ukulele practice video in under 5 minutes.

The automatically generated synchronization should require fewer than 10 manual edits for a typical pop song.

The final video should remain visually understandable on a smartphone screen.

---

# Future Features

- Guitar support.
- Capo handling.
- Automatic section detection (verse, chorus, bridge).
- Strumming pattern suggestions.
- AI-assisted chord alignment.
- Export to PDF chord sheets.
- Community sharing of synchronized songs.
- Karaoke-style scrolling chord timelines.

---

# Non-Goals (MVP)

The system will NOT:

- Automatically detect chords from audio.
- Replace professional transcription software.
- Host copyrighted videos publicly.
- Attempt perfect synchronization without user review.

The MVP prioritizes speed, usability, and practical value for musicians.
