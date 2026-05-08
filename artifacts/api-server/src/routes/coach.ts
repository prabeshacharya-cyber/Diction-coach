import { Router } from "express";
import { Buffer } from "node:buffer";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { TranscribeAudioBody, EvaluateTranscriptBody } from "@workspace/api-zod";

const router = Router();

const MASTER_PROMPT = `You are a Senior Partner on a Deloitte evaluation panel. You are assessing a candidate seeking promotion to Partner.
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
[Ask ONE aggressive, highly contextual follow-up question based strictly on the details the candidate just provided in their answer to test their strategic thinking on their feet.]`;

router.post("/transcribe", async (req, res) => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { audioBase64, mimeType } = parsed.data;

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

    const { toFile } = await import("openai");
    const audioFile = await toFile(audioBuffer, `recording.${format}`, { type: mimeType || "audio/wav" });

    const transcriptionResponse = await openai.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: audioFile,
      response_format: "json",
    });

    const transcript = transcriptionResponse.text?.trim() || "";
    if (!transcript) {
      res.status(400).json({ error: "No speech detected in the recording" });
      return;
    }

    const words = transcript.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    const estimatedDurationSeconds = Math.max(1, wordCount / 2.3);

    const minutes = estimatedDurationSeconds / 60;
    const wpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;

    res.json({
      transcript,
      durationSeconds: estimatedDurationSeconds,
      wordCount,
      wpm,
    });
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

router.post("/evaluate", async (req, res) => {
  const parsed = EvaluateTranscriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { transcript, promptText } = parsed.data;

  let userContent = `Candidate transcript:\n\n${transcript}`;
  if (promptText) {
    userContent = `Panel question: ${promptText}\n\n${userContent}`;
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

export default router;
