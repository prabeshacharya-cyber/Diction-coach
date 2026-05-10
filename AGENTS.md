# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a single-file Streamlit application (`app.py`) — an "Executive Presence & Diction Coach" for practicing spoken communication. It uses OpenAI for speech-to-text transcription and Anthropic Claude for AI-powered evaluation.

### Running the app

```bash
source .venv/bin/activate
streamlit run app.py --server.port 8501 --server.address 0.0.0.0 --server.headless true
```

### Required environment variables

- `OPENAI_API_KEY` — used for `gpt-4o-transcribe` speech-to-text
- `ANTHROPIC_API_KEY` — used for Claude evaluation

Without both keys, the app displays an error and calls `st.stop()`. The UI will still render the error message but no interactive components will be usable.

### Key gotchas

- `requirements.txt` pins `openai==1.59.0` which does not exist on PyPI (was yanked). Use `pip install "openai>=1.59.0,<1.60.0"` or install the other deps normally and openai separately with a compatible version (e.g. `1.59.2`+).
- The system needs `python3.12-venv` package installed (`sudo apt-get install python3.12-venv`) to create virtual environments.
- No linting, testing, or build tooling is configured in this repo. There are no test files or CI pipelines.
- The app is fully stateless — no database, no persistence layer.
- Audio recording requires a browser with microphone access; the `computerUse` subagent cannot provide real audio input, so full end-to-end flow (transcription + evaluation) requires actual mic hardware or mock audio injection.
