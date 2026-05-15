# Diction Coach — AI-Powered Oratory Platform

Transform your public speaking with the **Digital Mirror** — a world-class speech coaching tool that uses Gemini 1.5 Pro's multimodal intelligence to analyze not just what you say, but how you say it.

## 🚀 Key Features

- **The Four C's Framework**: Automated scoring for **Clarity**, **Confidence**, **Conciseness**, and **Connection**.
- **Voice Fingerprint**: Long-term tracking of your oratory improvements and rolling averages.
- **Real-Time Streaming Analysis**: Get immediate delivery metrics (WPM, Pauses, Fillers) while the AI Coach's feedback streams in.
- **Speak-Back (TTS)**: Listen to the AI's "Ideal Rewrite" and "Daily Drill" using high-quality neural voices to master your prosody.
- **Computer Vision Analysis**: Automated tracking of gesture energy and posture presence via MediaPipe.
- **Mobile-First PWA**: Fully responsive design with progressive web app support for coaching on the go.

## 🛠 Tech Stack

- **Frontend**: React, Vite, Lucide Icons, Glassmorphic CSS.
- **Backend**: FastAPI, SQLAlchemy (SQLite), Pydub, MediaPipe.
- **AI Intelligence**: 
  - **Gemini 1.5 Pro**: Primary Oratory Analyst & Senior Coach.
  - **DeepInfra (Whisper/DeepSeek)**: Low-latency transcription and alternate reasoning.
  - **Kokoro-82M**: Fast, high-fidelity neural text-to-speech.

## 🏁 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- API Keys: `GEMINI_API_KEY` and `DEEPINFRA_API_KEY`.

### Installation

1. **Clone & Setup Backend**:
   ```bash
   cd backend
   pip install -r ../requirements.txt
   ```

2. **Setup Frontend**:
   ```bash
   cd frontend
   npm install
   ```

3. **Environment**:
   Create a `.env` in the root:
   ```env
   GEMINI_API_KEY="your_key"
   DEEPINFRA_API_KEY="your_key"
   ```

### Running the App

1. **Start Backend**:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

## 🎙 Practice Flow

1. **Choose a Prompt**: Select from curated executive presence scenarios (Partner Panel, CFO pushback, etc.).
2. **Record**: Capture your delivery. Our system tracks fillers like "um", "ah", "you know", and "literally" in real-time.
3. **Analyze**: View your **4 C's Dashboard** and read the **Sandwich Method** feedback.
4. **Iterate**: Listen to the "Hear it" voice feedback and practice the "Today's Drill" follow-up challenge.

---
*Built for leaders who want to master their executive presence.*
