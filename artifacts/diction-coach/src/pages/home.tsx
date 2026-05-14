import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useTranscribeAudio,
  useEvaluateTranscript,
  useSpeakFeedback,
  useSaveSession,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useVideoRecorder } from "@/hooks/use-video-recorder";
import { HighlightedTranscript } from "@/lib/highlight-transcript";
import { parseFeedback, parseScores, scoreRingColor, countFillerWords } from "@/lib/parse-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Mic, Square, Activity, ChevronRight, CheckCircle2, AlertTriangle,
  RefreshCcw, Headphones, StopCircle, History, LogOut, Video, VideoOff,
  User, Loader2, BookmarkPlus, Check, MessageSquareQuote, FileText, HelpCircle, Dumbbell
} from "lucide-react";

const PROMPTS = [
  { id: "1", label: "Free-form (no prompt)", text: "Speak freely about any topic." },
  { id: "2", label: "GL Close standardization", text: "Why should we trust your approach to standardizing the GL close across our newly acquired subsidiaries?" },
  { id: "3", label: "O2C transformation", text: "Walk us through how you would lead an O2C transformation for a Fortune 500 client with siloed regional ERPs." },
  { id: "4", label: "P2P post-merger integration", text: "What is your point of view on rationalizing the P2P process during a post-merger integration?" },
  { id: "5", label: "Forecast to Stock at scale", text: "How would you redesign a Forecast-to-Stock process for a global manufacturer struggling with inventory carrying costs?" },
  { id: "6", label: "Pushing back on a CFO", text: "Tell us about a time you had to push back on a CFO. What did you do, and what was the outcome?" },
  { id: "7", label: "Why you, why now (Partner)", text: "Why you, and why now, for Partner?" },
];

function wpmBand(wpm: number) {
  if (wpm > 160) return { label: "Too fast", color: "text-destructive", bg: "bg-destructive", icon: AlertTriangle };
  if (wpm < 110) return { label: "Too slow", color: "text-yellow-400", bg: "bg-yellow-400", icon: AlertTriangle };
  if (wpm >= 130 && wpm <= 150) return { label: "Optimal pace", color: "text-green-400", bg: "bg-green-400", icon: CheckCircle2 };
  return { label: "Acceptable", color: "text-primary", bg: "bg-primary", icon: CheckCircle2 };
}

function ScoreRing({ label, score, animated }: { label: string; score: number; animated: boolean }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(10, Math.max(0, score)) / 10;
  const dashOffset = animated ? circumference * (1 - pct) : circumference;
  const color = scoreRingColor(label, score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="72" height="72" viewBox="0 0 72 72" className="overflow-visible">
        <circle
          cx="36" cy="36" r={radius}
          fill="none" stroke="currentColor" strokeWidth="6"
          className="text-muted/20"
        />
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: animated ? "stroke-dashoffset 0.9s ease-out" : "none" }}
        />
        <text
          x="36" y="36"
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          style={{ fontSize: "18px", fontWeight: 700, fontFamily: "inherit" }}
        >
          {score}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground text-center leading-tight max-w-[76px]">{label}</span>
    </div>
  );
}

function FillerBadge({ word, count }: { word: string; count: number }) {
  const intensity = count >= 5 ? "bg-red-500/20 text-red-400 border-red-500/40" :
    count >= 3 ? "bg-orange-500/20 text-orange-400 border-orange-500/40" :
      "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${intensity}`}>
      "{word}"
      <span className="font-bold">×{count}</span>
    </span>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [selectedPromptId, setSelectedPromptId] = useState("1");
  const selectedPrompt = PROMPTS.find(p => p.id === selectedPromptId) || PROMPTS[0];

  const { isRecording, audioLevel, videoUrl, videoRef, hasPermission, startRecording, stopRecording, reset: resetRecorder } = useVideoRecorder();
  const transcribeMutation = useTranscribeAudio();
  const evaluateMutation = useEvaluateTranscript();
  const speakMutation = useSpeakFeedback();
  const saveSessionMutation = useSaveSession();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [scoresAnimated, setScoresAnimated] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const parsedFeedback = evaluateMutation.data?.feedback
    ? parseFeedback(evaluateMutation.data.feedback)
    : null;

  const parsedScores = parsedFeedback?.scores
    ? parseScores(parsedFeedback.scores)
    : [];

  const fillerCounts = transcribeMutation.data?.transcript
    ? countFillerWords(transcribeMutation.data.transcript)
    : [];

  const totalFillers = fillerCounts.reduce((sum, f) => sum + f.count, 0);
  const fillerDensity = transcribeMutation.data
    ? ((totalFillers / (transcribeMutation.data.durationSeconds / 60))).toFixed(1)
    : "0";

  useEffect(() => {
    if (parsedScores.length > 0) {
      const t = setTimeout(() => setScoresAnimated(true), 100);
      return () => clearTimeout(t);
    }
    setScoresAnimated(false);
    return undefined;
  }, [parsedScores.length]);

  const wpm = transcribeMutation.data?.wpm;
  const wpmInfo = wpm != null ? wpmBand(wpm) : null;
  const wpmProgress = wpm != null ? Math.min(100, Math.max(0, ((wpm - 60) / (200 - 60)) * 100)) : 0;

  const handleToggleRecord = async () => {
    if (isRecording) {
      try {
        const result = await stopRecording();
        transcribeMutation.mutate({
          data: {
            audioBase64: result.audioBase64,
            mimeType: result.mimeType,
            durationSeconds: result.durationSeconds,
            videoFrames: result.videoFrames,
          },
        });
      } catch {
        // permission denied or device error handled by hasPermission state
      }
    } else {
      transcribeMutation.reset();
      evaluateMutation.reset();
      speakMutation.reset();
      setSessionSaved(false);
      setScoresAnimated(false);
      resetRecorder();
      startRecording();
    }
  };

  const handleEvaluate = () => {
    if (!transcribeMutation.data?.transcript) return;
    evaluateMutation.mutate({
      data: {
        transcript: transcribeMutation.data.transcript,
        promptLabel: selectedPrompt.label,
        promptText: selectedPrompt.text,
        bodyLanguageAnalysis: transcribeMutation.data.bodyLanguageAnalysis ?? undefined,
      },
    });
  };

  const handleSpeak = useCallback(async () => {
    if (!evaluateMutation.data?.feedback) return;
    if (isSpeaking) {
      audioRef.current?.pause();
      setIsSpeaking(false);
      return;
    }
    speakMutation.mutate(
      { data: { text: evaluateMutation.data.feedback } },
      {
        onSuccess: (data) => {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
          audioRef.current = audio;
          audio.play();
          setIsSpeaking(true);
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
        },
      }
    );
  }, [evaluateMutation.data?.feedback, isSpeaking, speakMutation]);

  const handleSaveSession = () => {
    if (!transcribeMutation.data) return;
    saveSessionMutation.mutate(
      {
        data: {
          promptLabel: selectedPrompt.id === "1" ? undefined : selectedPrompt.label,
          promptText: selectedPrompt.id === "1" ? undefined : selectedPrompt.text,
          transcript: transcribeMutation.data.transcript,
          wordCount: transcribeMutation.data.wordCount,
          wpm: transcribeMutation.data.wpm,
          durationSeconds: Math.round(transcribeMutation.data.durationSeconds),
          feedback: evaluateMutation.data?.feedback ?? undefined,
          bodyLanguageAnalysis: transcribeMutation.data.bodyLanguageAnalysis ?? undefined,
        },
      },
      { onSuccess: () => setSessionSaved(true) }
    );
  };

  const handleReset = () => {
    transcribeMutation.reset();
    evaluateMutation.reset();
    speakMutation.reset();
    setSessionSaved(false);
    setIsSpeaking(false);
    setScoresAnimated(false);
    audioRef.current?.pause();
    resetRecorder();
  };

  const showSetup = !transcribeMutation.data && !transcribeMutation.isPending;
  const showResults = !!transcribeMutation.data;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center py-10 px-4 font-sans">
      <div className="w-full max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Activity className="w-5 h-5" />
            <h1 className="text-xl font-bold tracking-tight">Diction Coach</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="gap-2 text-muted-foreground">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </Button>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {user?.firstName || user?.email || ""}
              </span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground px-2">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Setup Section */}
        {showSetup && (
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Select Practice Prompt</CardTitle>
              <CardDescription>Choose a Deloitte Partner panel question to practice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="prompt-select">Panel Question</Label>
                <Select value={selectedPromptId} onValueChange={setSelectedPromptId}>
                  <SelectTrigger id="prompt-select" className="w-full" data-testid="select-prompt">
                    <SelectValue placeholder="Select a prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMPTS.map(p => (
                      <SelectItem key={p.id} value={p.id} data-testid={`item-prompt-${p.id}`}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPrompt.id !== "1" && (
                  <p className="text-sm text-muted-foreground mt-2 italic leading-relaxed">
                    "{selectedPrompt.text}"
                  </p>
                )}
              </div>

              {/* Camera preview */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Camera Preview
                </Label>
                <div className="relative aspect-video bg-muted rounded-xl overflow-hidden border border-border">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  {!isRecording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
                      <VideoOff className="w-8 h-8 text-muted-foreground opacity-60" />
                      <p className="text-xs text-muted-foreground">Camera starts when you record</p>
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs text-white font-medium">Recording</span>
                    </div>
                  )}
                </div>
                {hasPermission === false && (
                  <p className="text-xs text-destructive">
                    Camera & microphone access denied. Please allow permissions and try again.
                  </p>
                )}
                {/* Live audio level meter */}
                {isRecording && (
                  <div className="space-y-1.5" data-testid="audio-level-meter">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Mic level
                      </span>
                      <span>{audioLevel < 0.05 ? "Silence" : audioLevel < 0.35 ? "Soft" : audioLevel < 0.7 ? "Good" : "Loud"}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-75"
                        style={{
                          width: `${Math.round(audioLevel * 100)}%`,
                          backgroundColor: audioLevel < 0.35
                            ? "hsl(var(--primary))"
                            : audioLevel < 0.7
                            ? "#22c55e"
                            : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Record Button */}
        {showSetup && (
          <Button
            onClick={handleToggleRecord}
            size="lg"
            variant={isRecording ? "destructive" : "default"}
            className="w-full gap-3 h-14 text-base"
            data-testid="btn-record"
            disabled={transcribeMutation.isPending}
          >
            {isRecording ? (
              <><Square className="w-5 h-5" /> Stop Recording</>
            ) : (
              <><Mic className="w-5 h-5" /> Start Recording</>
            )}
          </Button>
        )}

        {/* Processing */}
        {transcribeMutation.isPending && (
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="pt-6 pb-4 space-y-3">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">Transcribing and analyzing your presentation…</span>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {showResults && (
          <div className="space-y-5">
            {/* Prompt reminder */}
            {selectedPrompt.id !== "1" && (
              <div className="px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Question</p>
                <p className="text-sm italic text-foreground/80">"{selectedPrompt.text}"</p>
              </div>
            )}

            {/* Speech Metrics Dashboard */}
            {wpmInfo && (
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Speech Analytics
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-5">
                  {/* WPM Gauge */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <wpmInfo.icon className={`w-4 h-4 ${wpmInfo.color}`} />
                        <span className="text-sm font-medium">Speaking Pace</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${wpmInfo.color}`}>{wpm}</span>
                        <span className="text-xs text-muted-foreground ml-1">WPM</span>
                        <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${wpmInfo.color} border border-current/30 bg-current/10`}>
                          {wpmInfo.label}
                        </span>
                      </div>
                    </div>
                    <div className="relative">
                      <Progress value={wpmProgress} className="h-2" />
                      {/* Zone markers */}
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground/60">
                        <span>60</span>
                        <span>110</span>
                        <span className="text-green-400/80">130–150 optimal</span>
                        <span>160</span>
                        <span>200+</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {transcribeMutation.data?.wordCount} words · {Math.round(transcribeMutation.data?.durationSeconds ?? 0)}s duration
                    </div>
                  </div>

                  {/* Filler Word Stats */}
                  {fillerCounts.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Filler Words</span>
                        <span className="text-xs text-muted-foreground">
                          {totalFillers} total · <span className={totalFillers > 0 ? "text-orange-400" : "text-green-400"}>{fillerDensity}/min</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {fillerCounts.map(f => (
                          <FillerBadge key={f.word} word={f.word} count={f.count} />
                        ))}
                      </div>
                    </div>
                  )}
                  {fillerCounts.length === 0 && (
                    <div className="flex items-center gap-2 text-green-400 text-sm pt-1 border-t border-border/50">
                      <CheckCircle2 className="w-4 h-4" />
                      No filler words detected — excellent!
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Video Playback */}
            {videoUrl && (
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Your Recording
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <video src={videoUrl} controls className="w-full rounded-lg max-h-64 bg-black" playsInline />
                </CardContent>
              </Card>
            )}

            {/* Body Language Analysis */}
            {transcribeMutation.data?.bodyLanguageAnalysis && (
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Body Language & Presence
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-sm leading-relaxed">{transcribeMutation.data.bodyLanguageAnalysis}</p>
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="text-sm leading-relaxed">
                  <HighlightedTranscript text={transcribeMutation.data?.transcript ?? ""} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/60 mr-1" />filler words ·
                  <span className="inline-block w-3 h-3 rounded-sm bg-orange-500/30 border border-orange-500/60 mr-1 ml-2" />hedging language
                </p>
              </CardContent>
            </Card>

            {/* Get AI Coaching Button */}
            {!evaluateMutation.data && !evaluateMutation.isPending && (
              <Button
                onClick={handleEvaluate}
                size="lg"
                className="w-full gap-3 h-14 text-base"
                data-testid="btn-evaluate"
              >
                <ChevronRight className="w-5 h-5" />
                Get AI Coaching Feedback
              </Button>
            )}

            {/* AI Coaching Loading */}
            {evaluateMutation.isPending && (
              <Card className="border-border bg-card shadow-sm">
                <CardContent className="pt-6 pb-4 space-y-3">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm">Senior Partner is reviewing your response…</span>
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </CardContent>
              </Card>
            )}

            {/* AI Feedback */}
            {parsedFeedback && (
              <div className="space-y-4">

                {/* Score Rings */}
                {parsedScores.length > 0 && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        The Four C's
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
                        {parsedScores.map(({ label, score }) => (
                          <ScoreRing key={label} label={label} score={score} animated={scoresAnimated} />
                        ))}
                      </div>
                      {/* Aggregate */}
                      {parsedScores.length > 1 && (
                        <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-center gap-3">
                          <span className="text-sm text-muted-foreground">Overall</span>
                          <span
                            className="text-2xl font-bold"
                            style={{ color: scoreRingColor("overall", Math.round(parsedScores.reduce((s, x) => s + x.score, 0) / parsedScores.length)) }}
                          >
                            {(parsedScores.reduce((s, x) => s + x.score, 0) / parsedScores.length).toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">/ 10</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Voice Coaching Button — Prominent */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Verbal Coaching Session</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Hear a personalized coaching debrief from your Senior Partner — spoken naturally, not just text read aloud.
                  </p>
                  <Button
                    onClick={handleSpeak}
                    disabled={speakMutation.isPending}
                    className="w-full gap-2 h-11"
                    variant={isSpeaking ? "destructive" : "default"}
                    data-testid="btn-speak"
                  >
                    {speakMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Generating coaching script…</>
                    ) : isSpeaking ? (
                      <><StopCircle className="w-4 h-4" /> Stop Coaching Session</>
                    ) : (
                      <><Headphones className="w-4 h-4" /> Hear Your Coaching Session</>
                    )}
                  </Button>
                </div>

                {/* The Critique */}
                {parsedFeedback.critique && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <MessageSquareQuote className="w-4 h-4" />
                        The Critique
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{parsedFeedback.critique}</div>
                    </CardContent>
                  </Card>
                )}

                {/* Today's Drill */}
                {parsedFeedback.drill && (
                  <Card className="bg-card border-border shadow-sm border-primary/20">
                    <CardHeader className="pb-3 border-b border-border/50 bg-primary/5">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                        <Dumbbell className="w-4 h-4" />
                        Today's Drill
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">{parsedFeedback.drill}</div>
                    </CardContent>
                  </Card>
                )}

                {parsedFeedback.rewrite && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        BLUF Rewrite
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="text-sm whitespace-pre-wrap leading-relaxed pl-4 border-l-2 border-primary/50">
                        {parsedFeedback.rewrite}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Follow-Up Question */}
                {parsedFeedback.followUp && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <HelpCircle className="w-4 h-4" />
                        Panel Follow-Up
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="text-sm leading-relaxed italic text-foreground/90 pl-4 border-l-2 border-yellow-500/50">
                        {parsedFeedback.followUp}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Save Session */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveSession}
                  disabled={saveSessionMutation.isPending || sessionSaved}
                  className="gap-2 w-full"
                  data-testid="btn-save"
                >
                  {saveSessionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : sessionSaved ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <BookmarkPlus className="w-4 h-4" />
                  )}
                  {sessionSaved ? "Session Saved" : "Save Session to History"}
                </Button>
              </div>
            )}

            {/* Reset */}
            <Button variant="outline" onClick={handleReset} className="w-full gap-2" data-testid="btn-reset">
              <RefreshCcw className="w-4 h-4" />
              Start New Practice
            </Button>
          </div>
        )}

        {/* Errors */}
        {(transcribeMutation.isError || evaluateMutation.isError) && (
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            {transcribeMutation.isError
              ? "Transcription failed. Please try again."
              : "Coaching feedback failed. Please try again."}
          </div>
        )}
      </div>
    </div>
  );
}
