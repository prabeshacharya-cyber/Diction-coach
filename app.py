import io
import os
import re

import anthropic
import streamlit as st
from audio_recorder_streamlit import audio_recorder
from openai import OpenAI
from pydub import AudioSegment


FILLER_PATTERN = re.compile(
    r"\b(um|uh|like|basically|literally)\b", flags=re.IGNORECASE
)
HEDGE_PATTERN = re.compile(
    r"\b(I think|maybe|sort of|kind of|hopefully|just|try to)\b",
    flags=re.IGNORECASE,
)

MASTER_PROMPT = """You are a Senior Partner on a Deloitte evaluation panel. You are assessing a candidate seeking promotion to Partner.
The candidate has a strong track record, having led major implementations at IBM and Ernst & Young before their current eight-year tenure at our firm. Their expertise covers the entire suite of finance, accounting, and logistics orchestration (including O2C, P2P, Forecast to Stock, and GL Close)—not just FP&A.
Analyze the transcript strictly based on Executive Presence and the Minto Pyramid Principle. Provide your response formatted EXACTLY like this in Markdown:
### Partner Panel Scores
* **Conciseness & Tone:** [Score 1-10]
* **Executive Polish:** [Score 1-10]
* **Pyramid Principle:** [Score 1-10]

### The Critique (Speeko-Style Analysis)
[Provide blunt, constructive feedback on tone, confidence, and structure. Explicitly quote specific sentences that were rambling, sounded hesitant, or lost the executive audience's attention.]

### The Pointed Rewrite
[Rewrite the candidate's answer to be 30% shorter, punchier, and structured perfectly for a Partner panel using the Bottom-Line Up Front (BLUF) approach. Ensure the tone is highly authoritative.]

### Panel Follow-Up Question (Yoodli-Style Roleplay)
[Ask ONE aggressive, highly contextual follow-up question based strictly on the details the candidate just provided in their answer to test their strategic thinking on their feet.]"""


PRACTICE_PROMPTS = {
    "Free-form (no prompt)": "",
    "GL Close standardization": "Why should we trust your approach to standardizing the GL close across our newly acquired subsidiaries?",
    "O2C transformation": "Walk us through how you would lead an O2C transformation for a Fortune 500 client with siloed regional ERPs.",
    "P2P post-merger integration": "What is your point of view on rationalizing the P2P process during a post-merger integration?",
    "Forecast to Stock at scale": "How would you redesign a Forecast-to-Stock process for a global manufacturer struggling with inventory carrying costs?",
    "Pushing back on a CFO": "Tell us about a time you had to push back on a CFO. What did you do, and what was the outcome?",
    "Why you, why now (Partner)": "Why you, and why now, for Partner?",
}


def get_secret(name: str) -> str | None:
    val = os.environ.get(name)
    if val:
        return val
    try:
        return st.secrets.get(name)
    except Exception:
        return None


def highlight_transcript(text: str) -> str:
    text = FILLER_PATTERN.sub(
        r'<span style="color:#e53935; font-weight:bold">\1</span>', text
    )
    text = HEDGE_PATTERN.sub(
        r'<span style="color:#fb8c00; font-weight:bold">\1</span>', text
    )
    return text


st.set_page_config(page_title="Executive Presence Coach", page_icon="🎙️")
st.title("Executive Presence & Diction Coach")
st.markdown(
    "Practice your Deloitte Partner panel answers. Speak with the "
    "**Minto Pyramid Principle** in mind and lead with the headline."
)

openai_key = get_secret("OPENAI_API_KEY")
anthropic_key = get_secret("ANTHROPIC_API_KEY")

if not openai_key or not anthropic_key:
    st.error(
        "Missing API keys. On **Replit**, open the **Secrets** tab (lock icon) "
        "and add `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`. Locally, export them "
        "as environment variables or place them in `.streamlit/secrets.toml`."
    )
    st.stop()

openai_client = OpenAI(api_key=openai_key)
claude_client = anthropic.Anthropic(api_key=anthropic_key)

prompt_label = st.selectbox("Practice prompt", list(PRACTICE_PROMPTS.keys()))
prompt_text = PRACTICE_PROMPTS[prompt_label]
if prompt_text:
    st.info(f"**Panel question:** {prompt_text}")

st.write("Click the microphone to start recording. Click again to stop.")
audio_bytes = audio_recorder(pause_threshold=3.0, text="", icon_size="2x")

if not audio_bytes:
    st.stop()

st.audio(audio_bytes, format="audio/wav")

with st.spinner("Decoding audio..."):
    try:
        audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
    except Exception as e:
        st.error(f"Could not decode audio: {e}")
        st.stop()

duration_seconds = len(audio_segment) / 1000.0
if duration_seconds < 1.0:
    st.warning("Recording is too short to evaluate. Try again.")
    st.stop()

transcribe_buffer = io.BytesIO(audio_bytes)
transcribe_buffer.name = "recording.wav"

with st.spinner("Transcribing with gpt-4o-transcribe..."):
    try:
        transcript_response = openai_client.audio.transcriptions.create(
            model="gpt-4o-transcribe",
            file=transcribe_buffer,
        )
        transcript = (transcript_response.text or "").strip()
    except Exception as e:
        st.error(f"Transcription failed: {e}")
        st.stop()

if not transcript:
    st.warning("No speech detected in the recording.")
    st.stop()

st.subheader("Your Transcript & Diction Breakdown")
st.markdown(highlight_transcript(transcript), unsafe_allow_html=True)
st.caption("🔴 Red = Filler Words | 🟠 Orange = Hedging / Weak Language")

words = transcript.split()
minutes = duration_seconds / 60.0
wpm = round(len(words) / minutes) if minutes > 0 else 0

col_metric, col_alert = st.columns([1, 2])
with col_metric:
    st.metric(label="Pacing (Target: 130-150 WPM)", value=f"{wpm} WPM")
with col_alert:
    if wpm > 160:
        st.error("Too fast. You are rushing the delivery.")
    elif wpm < 110:
        st.warning("Too slow. Pick up the energy.")
    else:
        st.success("Pace is in the executive band.")

user_content = f"Candidate transcript:\n\n{transcript}"
if prompt_text:
    user_content = f"Panel question: {prompt_text}\n\n{user_content}"

with st.spinner("Claude is evaluating your executive conciseness..."):
    try:
        message = claude_client.messages.create(
            model="claude-3-5-sonnet-latest",
            max_tokens=1000,
            system=MASTER_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        feedback = message.content[0].text
    except Exception as e:
        st.error(f"Evaluation failed: {e}")
        st.stop()

st.subheader("Partner Panel Feedback")
st.markdown(feedback)
