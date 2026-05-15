import { Router } from "express";
import { Buffer } from "node:buffer";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  TranscribeAudioBody,
  EvaluateTranscriptBody,
  SpeakFeedbackBody,
  SaveSessionBody,
} from "@workspace/api-zod";
import { db, practiceSessionsTable, voiceProfilesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------
export const MODELS = [
  { id: "claude", name: "Claude 3.5 Sonnet (Default)", group: "Anthropic" },
  { id: "gemini/gemini-2.5-pro", name: "Gemini 2.5 Pro", group: "Google Gemini" },
  { id: "gemini/gemini-2.5-flash", name: "Gemini 2.5 Flash", group: "Google Gemini" },
  { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", group: "DeepSeek" },
  { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1 (Reasoning)", group: "DeepSeek" },
  { id: "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", group: "Meta Llama" },
  { id: "meta-llama/Meta-Llama-3.1-405B-Instruct", name: "Llama 3.1 405B", group: "Meta Llama" },
  { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B", group: "Qwen" },
  { id: "Qwen/QwQ-32B", name: "QwQ 32B (Reasoning)", group: "Qwen" },
  { id: "mistralai/Mixtral-8x22B-Instruct-v0.1", name: "Mixtral 8x22B", group: "Mistral" },
];

const DEFAULT_MODEL_ID = "claude";

// ---------------------------------------------------------------------------
// Filler / hedge highlighting (server-side)
// ---------------------------------------------------------------------------
const FILLER_RE = /\b(um|uh|erm|like|basically|literally|actually|so|right|you know|I mean)\b/gi;
const HEDGE_RE = /\b(I think|maybe|sort of|kind of|hopefully|just|try to|to be honest|honestly|at the end of the day|in terms of)\b/gi;

function highlightTranscript(text: string): string {
  return text
    .replace(FILLER_RE, '<span style="color:#f87171;font-weight:600">$1</span>')
    .replace(HEDGE_RE, '<span style="color:#fb923c;font-weight:600">$1</span>');
}

function countFillers(text: string): number {
  return (text.match(FILLER_RE) ?? []).length + (text.match(HEDGE_RE) ?? []).length;
}

// ---------------------------------------------------------------------------
// Master prompt
// ---------------------------------------------------------------------------
const MASTER_PROMPT = `You are a world-class Senior Partner on a Deloitte evaluation panel and speech coach assessing a candidate seeking promotion to Partner. The candidate has a strong track record leading major implementations at IBM and Ernst & Young before an eight-year tenure at Deloitte. Their expertise covers finance, accounting, and logistics orchestration (O2C, P2P, Forecast to Stock, GL Close).

Analyze the transcript using The Four C's framework and the Minto Pyramid Principle. When body language analysis is provided, incorporate it into your coaching.

Provide your response formatted EXACTLY like this in Markdown:

### Partner Panel Scores — The Four C's
* **Clarity** (Diction & Articulation): [Score 1-10]
* **Confidence** (Tone & Vocal Authority): [Score 1-10]
* **Conciseness** (Structure & Brevity): [Score 1-10]
* **Connection** (Resonance & Engagement): [Score 1-10]
* **Presence & Composure** (Body Language): [Score 1-10 — only include this line if body language data is available]

### The Critique
[Blunt, constructive Partner-level feedback. Explicitly quote specific sentences that were rambling, hesitant, or lost the panel's attention. Explain WHY each weakness hurt the delivery. If body language data is available, comment on physical presence and signs of nervousness.]

### Today's Drill
[Based on the candidate's single biggest weakness above, prescribe ONE specific 60-second practice exercise they should do before their next session. Be concrete — give them the exact words, tongue twister, or technique to practice. Format: "**Drill:** [Name] — [Instructions]"]

### BLUF Rewrite
[Rewrite the candidate's answer to be 30% shorter, punchier, and structured perfectly for a Partner panel using the Bottom-Line Up Front (BLUF) approach. The tone must be highly authoritative.]

### Panel Follow-Up Question
[Ask ONE aggressive, highly contextual follow-up question based strictly on the details the candidate just provided to test their strategic thinking on their feet.]`;

// ---------------------------------------------------------------------------
// GET /models
// ---------------------------------------------------------------------------
router.get("/models", (_req, res) => {
  res.json({ models: MODELS, default: DEFAULT_MODEL_ID });
});

// ---------------------------------------------------------------------------
// POST /transcribe
// ---------------------------------------------------------------------------
router.post("/transcribe", async (req, res) => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { audioBase64, mimeType, videoFrames } = parsed.data;

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 audio data" });
    return;
  }

  if (audioBuffer.length < 100) {
    res.status(400).json({ error: "Audio recording is too short" });
    return;
  }

  try {
    const format = (mimeType?.includes("webm") ? "webm" : "wav") as "wav" | "webm";
    const audioFile = new File([new Uint8Array(audioBuffer)], `recording.${format}`, {
      type: mimeType || "audio/webm",
    });

    const [transcriptionResponse, bodyLanguageAnalysis] = await Promise.all([
      transcribeAudio(audioFile),
      videoFrames && videoFrames.length > 0
        ? analyzeBodyLanguage(videoFrames)
        : Promise.resolve(undefined),
    ]);

    const transcript = transcriptionResponse.trim();
    if (!transcript) {
      res.status(400).json({ error: "No speech detected in the recording" });
      return;
    }

    const words = transcript.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const { durationSeconds: clientDuration } = parsed.data;
    const durationSeconds =
      typeof clientDuration === "number" && clientDuration > 0
        ? clientDuration
        : Math.max(1, wordCount / 2.3);

    const minutes = durationSeconds / 60;
    const wpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;
    const highlightedTranscript = highlightTranscript(transcript);
    const fillerCount = countFillers(transcript);

    res.json({
      transcript,
      highlightedTranscript,
      fillerCount,
      durationSeconds,
      wordCount,
      wpm,
      bodyLanguageAnalysis,
    });
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

async function transcribeAudio(file: File): Promise<string> {
  const deepinfraKey = process.env.DEEPINFRA_API_KEY;
  if (deepinfraKey) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "openai/whisper-large-v3");
      const resp = await fetch("https://api.deepinfra.com/v1/openai/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${deepinfraKey}` },
        body: formData,
      });
      if (resp.ok) {
        const data = await resp.json() as { text?: string };
        if (data.text) return data.text;
      }
    } catch (err) {
      console.warn("DeepInfra Whisper failed, falling back to OpenAI:", err);
    }
  }
  const result = await openai.audio.transcriptions.create({
    model: "gpt-4o-transcribe",
    file,
    response_format: "json",
  });
  return result.text ?? "";
}

async function analyzeBodyLanguage(frames: string[]): Promise<string> {
  const imageContent = frames.slice(0, 5).map((frame) => ({
    type: "image_url" as const,
    image_url: {
      url: frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}`,
      detail: "low" as const,
    },
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an executive presentation coach. Analyze these video frames from someone's practice presentation and give a concise coaching note (3-5 sentences) covering:
1. Posture and physical composure — are they sitting/standing upright or slouching?
2. Eye contact — are they looking at the camera (audience) or looking away?
3. Signs of nervousness — visible fidgeting, tense body language, excessive movement?
4. Facial expression — do they project confidence, warmth, or anxiety?
5. Overall presentation style — do they look like a Partner-level executive?

Be direct and specific. If something looks good, say so briefly. Focus most on areas to improve.`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// POST /evaluate  — multi-model routing
// ---------------------------------------------------------------------------
router.post("/evaluate", async (req, res) => {
  const parsed = EvaluateTranscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { transcript, promptText, bodyLanguageAnalysis, modelId } = parsed.data;

  let userContent = `Candidate transcript:\n\n${transcript}`;
  if (promptText) userContent = `Panel question: ${promptText}\n\n${userContent}`;
  if (bodyLanguageAnalysis) {
    userContent += `\n\n---\nBody Language & Presentation Analysis:\n${bodyLanguageAnalysis}`;
  }

  const chosenModel = modelId || DEFAULT_MODEL_ID;

  try {
    let feedback: string;
    let modelUsed: string;

    if (chosenModel === "claude" || chosenModel.startsWith("claude-")) {
      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 8192,
        system: MASTER_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      const block = message.content[0];
      feedback = block.type === "text" ? block.text : "";
      modelUsed = "claude-3-5-sonnet-latest";

    } else if (chosenModel.startsWith("gemini/")) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        res.status(500).json({ error: "GEMINI_API_KEY is not set. Add it in your environment secrets." });
        return;
      }
      const geminiModel = chosenModel.replace("gemini/", "");
      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: MASTER_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userContent }] }],
            generationConfig: { maxOutputTokens: 8192 },
          }),
        }
      );
      if (!geminiResp.ok) {
        const err = await geminiResp.text();
        console.error("Gemini error:", err);
        res.status(500).json({ error: "Gemini API request failed" });
        return;
      }
      const geminiData = await geminiResp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      feedback = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      modelUsed = geminiModel;

    } else {
      const deepinfraKey = process.env.DEEPINFRA_API_KEY;
      if (!deepinfraKey) {
        res.status(500).json({ error: "DEEPINFRA_API_KEY is not set. Add it in your environment secrets." });
        return;
      }
      const diResp = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepinfraKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [
            { role: "system", content: MASTER_PROMPT },
            { role: "user", content: userContent },
          ],
          max_tokens: 8192,
        }),
      });
      if (!diResp.ok) {
        const err = await diResp.text();
        console.error("DeepInfra error:", err);
        res.status(500).json({ error: "DeepInfra API request failed" });
        return;
      }
      const diData = await diResp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      feedback = diData.choices?.[0]?.message?.content ?? "";
      modelUsed = chosenModel;
    }

    res.json({ feedback, modelUsed });
  } catch (err) {
    console.error("Evaluation error:", err);
    res.status(500).json({ error: "Evaluation failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /speak — Kokoro-82M via DeepInfra, falls back to OpenAI TTS
// ---------------------------------------------------------------------------
router.post("/speak", async (req, res) => {
  const parsed = SpeakFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { text } = parsed.data;

  try {
    const scriptResponse = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 500,
      system: `You are a Senior Partner at Deloitte giving verbal coaching feedback to a candidate after their practice presentation. Convert the written coaching report into a natural spoken debrief.

Rules:
- Pure flowing speech — no lists, no asterisks, no "number one", no markdown formatting
- Open directly and confidently: "Alright, let me give you my honest read on that."
- Weave in the actual score numbers naturally: "I landed you at an eight on conciseness — here's why."
- Name one concrete strength and one most critical improvement
- End with a single specific, actionable technique the candidate can apply in the next practice
- 140–170 words total — crisp, not padded
- Tone: direct, confident senior partner. Not a cheerleader. Brutally honest but constructive.`,
      messages: [{ role: "user", content: `Convert this written coaching report into a natural spoken script:\n\n${text}` }],
    });

    const spokenScript =
      scriptResponse.content[0]?.type === "text"
        ? scriptResponse.content[0].text.trim()
        : text.replace(/#{1,6}\s/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();

    const audioBuffer = await generateSpeech(spokenScript.slice(0, 4096));
    res.json({ audioBase64: audioBuffer.toString("base64") });
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Text-to-speech failed" });
  }
});

async function generateSpeech(text: string): Promise<Buffer> {
  const deepinfraKey = process.env.DEEPINFRA_API_KEY;
  if (deepinfraKey) {
    try {
      const resp = await fetch("https://api.deepinfra.com/v1/openai/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deepinfraKey}`,
        },
        body: JSON.stringify({
          model: "hexgrad/Kokoro-82M",
          input: text,
          voice: "af_sky",
        }),
      });
      if (resp.ok) {
        const arrayBuffer = await resp.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      console.warn("Kokoro TTS failed with status", resp.status, "— falling back to OpenAI TTS");
    } catch (err) {
      console.warn("Kokoro TTS failed, falling back to OpenAI TTS:", err);
    }
  }
  return textToSpeech(text, "onyx", "mp3");
}

// ---------------------------------------------------------------------------
// GET /voice-profile
// ---------------------------------------------------------------------------
router.get("/voice-profile", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const [profile] = await db
      .select()
      .from(voiceProfilesTable)
      .where(eq(voiceProfilesTable.userId, req.user.id))
      .limit(1);

    if (!profile) {
      res.json({ avgClarity: 5, avgConfidence: 5, avgConciseness: 5, avgConnection: 5, totalSessions: 0 });
      return;
    }
    res.json({
      avgClarity: Math.round(profile.avgClarity * 10) / 10,
      avgConfidence: Math.round(profile.avgConfidence * 10) / 10,
      avgConciseness: Math.round(profile.avgConciseness * 10) / 10,
      avgConnection: Math.round(profile.avgConnection * 10) / 10,
      totalSessions: profile.totalSessions,
    });
  } catch (err) {
    console.error("Voice profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch voice profile" });
  }
});

// ---------------------------------------------------------------------------
// GET /sessions
// ---------------------------------------------------------------------------
router.get("/sessions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const sessions = await db
      .select()
      .from(practiceSessionsTable)
      .where(eq(practiceSessionsTable.userId, req.user.id))
      .orderBy(desc(practiceSessionsTable.createdAt))
      .limit(50);

    res.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        promptLabel: s.promptLabel,
        wpm: s.wpm,
        wordCount: s.wordCount,
        durationSeconds: s.durationSeconds,
        createdAt: s.createdAt.toISOString(),
        transcript: s.transcript,
        highlightedTranscript: s.highlightedTranscript ?? undefined,
        feedback: s.feedback,
        bodyLanguageAnalysis: s.bodyLanguageAnalysis,
        modelUsed: s.modelUsed ?? undefined,
        clarityScore: s.clarityScore ?? undefined,
        confidenceScore: s.confidenceScore ?? undefined,
        concisenessScore: s.concisenessScore ?? undefined,
        connectionScore: s.connectionScore ?? undefined,
        fillerCount: s.fillerCount ?? undefined,
      })),
    });
  } catch (err) {
    console.error("Sessions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// ---------------------------------------------------------------------------
// POST /sessions — save + update voice profile rolling average
// ---------------------------------------------------------------------------
router.post("/sessions", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SaveSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [saved] = await db
      .insert(practiceSessionsTable)
      .values({ userId: req.user.id, ...parsed.data })
      .returning({ id: practiceSessionsTable.id, createdAt: practiceSessionsTable.createdAt });

    // Update voice profile rolling averages when we have Four C's scores
    const { clarityScore, confidenceScore, concisenessScore, connectionScore } = parsed.data;
    if (
      clarityScore != null &&
      confidenceScore != null &&
      concisenessScore != null &&
      connectionScore != null
    ) {
      await updateVoiceProfile(req.user.id, {
        clarity: clarityScore,
        confidence: confidenceScore,
        conciseness: concisenessScore,
        connection: connectionScore,
      });
    }

    res.json({ id: saved.id, createdAt: saved.createdAt.toISOString() });
  } catch (err) {
    console.error("Session save error:", err);
    res.status(500).json({ error: "Failed to save session" });
  }
});

async function updateVoiceProfile(
  userId: string,
  scores: { clarity: number; confidence: number; conciseness: number; connection: number }
) {
  const [existing] = await db
    .select()
    .from(voiceProfilesTable)
    .where(eq(voiceProfilesTable.userId, userId))
    .limit(1);

  if (!existing) {
    await db.insert(voiceProfilesTable).values({
      userId,
      avgClarity: scores.clarity,
      avgConfidence: scores.confidence,
      avgConciseness: scores.conciseness,
      avgConnection: scores.connection,
      totalSessions: 1,
      updatedAt: new Date(),
    });
  } else {
    const n = existing.totalSessions;
    await db
      .update(voiceProfilesTable)
      .set({
        avgClarity: (existing.avgClarity * n + scores.clarity) / (n + 1),
        avgConfidence: (existing.avgConfidence * n + scores.confidence) / (n + 1),
        avgConciseness: (existing.avgConciseness * n + scores.conciseness) / (n + 1),
        avgConnection: (existing.avgConnection * n + scores.connection) / (n + 1),
        totalSessions: n + 1,
        updatedAt: new Date(),
      })
      .where(eq(voiceProfilesTable.userId, userId));
  }
}

export default router;
