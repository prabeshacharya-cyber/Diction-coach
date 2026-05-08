import { useState } from "react";
import { useTranscribeAudio, useEvaluateTranscript, useHealthCheck } from "@workspace/api-client-react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { HighlightedTranscript } from "@/lib/highlight-transcript";
import { parseFeedback } from "@/lib/parse-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Mic, Square, Activity, ChevronRight, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PROMPTS = [
  { id: "1", label: "Free-form (no prompt)", text: "Speak freely about any topic." },
  { id: "2", label: "GL Close standardization", text: "Why should we trust your approach to standardizing the GL close across our newly acquired subsidiaries?" },
  { id: "3", label: "O2C transformation", text: "Walk us through how you would lead an O2C transformation for a Fortune 500 client with siloed regional ERPs." },
  { id: "4", label: "P2P post-merger integration", text: "What is your point of view on rationalizing the P2P process during a post-merger integration?" },
  { id: "5", label: "Forecast to Stock at scale", text: "How would you redesign a Forecast-to-Stock process for a global manufacturer struggling with inventory carrying costs?" },
  { id: "6", label: "Pushing back on a CFO", text: "Tell us about a time you had to push back on a CFO. What did you do, and what was the outcome?" },
  { id: "7", label: "Why you, why now (Partner)", text: "Why you, and why now, for Partner?" }
];

export default function Home() {
  const [selectedPromptId, setSelectedPromptId] = useState("1");
  const selectedPrompt = PROMPTS.find(p => p.id === selectedPromptId) || PROMPTS[0];
  
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const transcribeMutation = useTranscribeAudio();
  const evaluateMutation = useEvaluateTranscript();
  const { isError: isApiDown } = useHealthCheck();

  const handleToggleRecord = async () => {
    if (isRecording) {
      const audioData = await stopRecording();
      transcribeMutation.mutate({ data: audioData });
    } else {
      transcribeMutation.reset();
      evaluateMutation.reset();
      startRecording();
    }
  };

  const handleEvaluate = () => {
    if (!transcribeMutation.data?.transcript) return;
    
    evaluateMutation.mutate({
      data: {
        transcript: transcribeMutation.data.transcript,
        promptLabel: selectedPrompt.label,
        promptText: selectedPrompt.text
      }
    });
  };

  const handleReset = () => {
    transcribeMutation.reset();
    evaluateMutation.reset();
  };

  const wpm = transcribeMutation.data?.wpm || 0;
  let wpmStatus = "neutral";
  let wpmColor = "text-gray-400";
  if (wpm > 160) {
    wpmStatus = "error";
    wpmColor = "text-red-500";
  } else if (wpm > 0 && wpm < 110) {
    wpmStatus = "warning";
    wpmColor = "text-orange-500";
  } else if (wpm >= 130 && wpm <= 150) {
    wpmStatus = "success";
    wpmColor = "text-green-500";
  }

  const parsedFeedback = evaluateMutation.data ? parseFeedback(evaluateMutation.data.feedback) : null;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center py-12 px-4 font-sans">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Activity className="w-6 h-6" />
            <h1 className="text-2xl font-bold tracking-tight">Diction Coach</h1>
          </div>
          <p className="text-muted-foreground text-sm">Executive presence & speech coaching for Deloitte Partner panel rehearsals.</p>
          {isApiDown && (
            <p className="text-xs text-destructive" data-testid="status-api-error">
              Unable to reach the coaching service. Please check your connection.
            </p>
          )}
        </div>

        {/* Configuration Section */}
        {(!transcribeMutation.data && !transcribeMutation.isPending) && (
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Select Practice Prompt</CardTitle>
              <CardDescription>Choose a prompt to practice or speak freely.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
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
              </div>

              {selectedPromptId !== "1" && (
                <div className="p-4 rounded-md bg-muted/50 border border-border">
                  <p className="text-sm font-medium text-foreground italic leading-relaxed">
                    "{selectedPrompt.text}"
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-center">
                <Button 
                  size="lg" 
                  onClick={handleToggleRecord}
                  variant={isRecording ? "destructive" : "default"}
                  className="w-full sm:w-auto min-w-[200px] h-14 text-base font-semibold transition-all duration-200 shadow-lg"
                  data-testid="button-record"
                >
                  {isRecording ? (
                    <>
                      <Square className="mr-2 h-5 w-5 fill-current animate-pulse-fast" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-5 w-5" />
                      Start Recording
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transcription Loading State */}
        {transcribeMutation.isPending && (
          <Card className="border-border bg-card shadow-sm border-primary/20">
            <CardContent className="p-8 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-lg font-medium text-primary animate-pulse">Transcribing audio...</p>
            </CardContent>
          </Card>
        )}

        {/* Transcript & Evaluation Section */}
        {transcribeMutation.data && !transcribeMutation.isPending && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-lg">Transcript & Analysis</CardTitle>
                  <div className="flex items-center gap-4 text-sm bg-muted/50 py-1.5 px-3 rounded-full border border-border">
                    <span className="text-muted-foreground font-mono">Duration: {transcribeMutation.data.durationSeconds.toFixed(1)}s</span>
                    <div className="w-px h-4 bg-border" />
                    <span className={`font-mono font-bold ${wpmColor}`} data-testid="text-wpm">
                      {Math.round(wpm)} WPM
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                
                <div className="p-5 rounded-md bg-muted/30 border border-border/50 min-h-[100px] max-h-[300px] overflow-y-auto">
                  <p className="text-base leading-relaxed text-foreground font-serif">
                    <HighlightedTranscript text={transcribeMutation.data.transcript} />
                  </p>
                </div>

                {wpmStatus !== "neutral" && (
                  <div className={`p-3 rounded-md text-sm flex items-start gap-2 ${
                    wpmStatus === "error" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    wpmStatus === "warning" ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                    "bg-green-500/10 text-green-400 border border-green-500/20"
                  }`}>
                    {wpmStatus === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                    <div>
                      <span className="font-semibold block mb-0.5">
                        {wpmStatus === "error" ? "Speaking rate is too fast." : wpmStatus === "warning" ? "Speaking rate is too slow." : "Perfect speaking rate."}
                      </span>
                      <span>Target: 130-150 WPM. Fast speech can project nervousness; slow speech may lose the panel's attention.</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-2">
                  {!evaluateMutation.data && !evaluateMutation.isPending && (
                    <Button 
                      className="w-full" 
                      onClick={handleEvaluate}
                      data-testid="button-evaluate"
                    >
                      Generate AI Feedback
                      <ChevronRight className="ml-2 w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleReset} data-testid="button-rerecord">
                    <RefreshCcw className="mr-2 w-4 h-4" />
                    Discard & Retry
                  </Button>
                </div>

              </CardContent>
            </Card>

            {/* Evaluation Loading State */}
            {evaluateMutation.isPending && (
              <Card className="border-border bg-card shadow-sm border-primary/20">
                <CardContent className="p-8 space-y-6">
                  <div className="flex items-center gap-4 text-primary mb-6">
                    <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="font-medium">Evaluating response structure and delivery...</p>
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-3/4 bg-muted" />
                    <Skeleton className="h-4 w-full bg-muted" />
                    <Skeleton className="h-4 w-5/6 bg-muted" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Evaluation Results */}
            {parsedFeedback && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Scores & Critique */}
                  <div className="space-y-6">
                    {parsedFeedback.scores && (
                      <Card className="bg-card border-border shadow-sm h-full">
                        <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Partner Panel Scores</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap font-mono">
                            {parsedFeedback.scores}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <div className="space-y-6">
                    {parsedFeedback.followUp && (
                      <Card className="bg-primary/5 border-primary/20 shadow-sm h-full">
                        <CardHeader className="pb-3 border-b border-primary/10">
                          <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">Panel Follow-Up Question</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="prose prose-sm dark:prose-invert max-w-none text-base italic font-serif leading-relaxed text-foreground">
                            "{parsedFeedback.followUp}"
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                {parsedFeedback.critique && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">The Critique</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed">
                        {parsedFeedback.critique}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {parsedFeedback.rewrite && (
                  <Card className="bg-card border-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">BLUF Rewrite</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed pl-4 border-l-2 border-primary/50">
                        {parsedFeedback.rewrite}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
