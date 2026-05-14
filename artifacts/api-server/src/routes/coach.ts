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
import { db, practiceSessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

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
      openai.audio.transcriptions.create({
        model: "gpt-4o-transcribe",
        file: audioFile,
        response_format: "json",
      }),
      videoFrames && videoFrames.length > 0
        ? analyzeBodyLanguage(videoFrames)
        : Promise.resolve(undefined),
    ]);

    const transcript = transcriptionResponse.text?.trim() || "";
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

    res.json({ transcript, durationSeconds, wordCount, wpm, bodyLanguageAnalysis });
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

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

router.post("/evaluate", async (req, res) => {
  const parsed = EvaluateTranscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { transcript, promptText, bodyLanguageAnalysis } = parsed.data;

  let userContent = `Candidate transcript:\n\n${transcript}`;
  if (promptText) {
    userContent = `Panel question: ${promptText}\n\n${userContent}`;
  }
  if (bodyLanguageAnalysis) {
    userContent += `\n\n---\nBody Language & Presentation Analysis:\n${bodyLanguageAnalysis}`;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 8192,
      system: MASTER_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const block = message.content[0];
    const feedback = block.type === "text" ? block.text : "";
    res.json({ feedback });
  } catch (err) {
    console.error("Evaluation error:", err);
    res.status(500).json({ error: "Evaluation failed" });
  }
});

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
        : text
            .replace(/#{1,6}\s/g, "")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .trim();

    const audioBuffer = await textToSpeech(spokenScript.slice(0, 4096), "onyx", "mp3");
    res.json({ audioBase64: audioBuffer.toString("base64") });
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Text-to-speech failed" });
  }
});

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
        feedback: s.feedback,
        bodyLanguageAnalysis: s.bodyLanguageAnalysis,
      })),
    });
  } catch (err) {
    console.error("Sessions fetch error:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

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

    res.json({ id: saved.id, createdAt: saved.createdAt.toISOString() });
  } catch (err) {
    console.error("Session save error:", err);
    res.status(500).json({ error: "Failed to save session" });
  }
});

export default router;
