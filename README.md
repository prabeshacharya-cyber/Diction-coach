# Executive Presence & Diction Coach

A Streamlit app for rehearsing Deloitte Partner panel answers. It mimics
**Yoodli** (dynamic follow-up questions) and **Speeko** (filler / hedging-word
highlighting and pacing analysis).

- **Speech-to-Text:** OpenAI `gpt-4o-transcribe`
- **Evaluator:** Anthropic `claude-3-5-sonnet-latest`
- **Capture:** in-app microphone via `audio_recorder_streamlit`

## Run on Replit

1. Create a new Python Repl and import this repo.
2. Open the **Secrets** tab (lock icon) and add:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
3. In the shell, install deps:
   ```bash
   pip install -r requirements.txt
   ```
4. Set the run command to:
   ```bash
   streamlit run app.py --server.port 8080 --server.address 0.0.0.0
   ```

The recorder returns WAV bytes, so `pydub` works without `ffmpeg`. If you
swap in another recorder that emits MP3/WebM, add `ffmpeg` via `replit.nix`.

## Run locally

```bash
pip install -r requirements.txt
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
streamlit run app.py
```

Or create `.streamlit/secrets.toml`:

```toml
OPENAI_API_KEY = "sk-..."
ANTHROPIC_API_KEY = "sk-ant-..."
```

## Practice flow

1. Pick a panel prompt from the dropdown (or go free-form).
2. Hit the mic and answer out loud.
3. Watch the transcript light up: **red** = filler, **orange** = hedging.
4. Check WPM — target **130–150**.
5. Read Claude's BLUF rewrite and answer the follow-up question on the spot.
