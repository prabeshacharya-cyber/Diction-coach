import { useGetSessions, getGetSessionsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, Clock, Zap, Calendar } from "lucide-react";
import { parseFeedback } from "@/lib/parse-feedback";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function wpmColor(wpm: number) {
  if (wpm > 160) return "text-destructive";
  if (wpm < 110) return "text-yellow-400";
  return "text-green-400";
}

export default function History() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data, isLoading } = useGetSessions({ query: { queryKey: getGetSessionsQueryKey(), enabled: !!user } });

  return (
    <div className="min-h-screen bg-background px-4 py-10 font-sans">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Session History</h1>
            <p className="text-muted-foreground text-sm">Your past practice sessions</p>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (!data?.sessions || data.sessions.length === 0) && (
          <div className="text-center py-20 space-y-2">
            <Mic className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground text-sm">No sessions yet. Record your first practice!</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Start practicing
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {data?.sessions?.map((session) => {
            const parsed = session.feedback ? parseFeedback(session.feedback) : null;
            return (
              <Card key={session.id} className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {session.promptLabel || "Free-form practice"}
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(session.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(session.durationSeconds)}
                        </span>
                        <span className={`flex items-center gap-1 font-medium ${wpmColor(session.wpm)}`}>
                          <Zap className="w-3 h-3" />
                          {session.wpm} WPM
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {session.transcript && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      "{session.transcript}"
                    </p>
                  )}
                  {session.bodyLanguageAnalysis && (
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Body Language</p>
                      <p className="text-xs leading-relaxed line-clamp-2">{session.bodyLanguageAnalysis}</p>
                    </div>
                  )}
                  {parsed?.scores && (
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Scores</p>
                      <p className="text-xs leading-relaxed line-clamp-3 whitespace-pre-wrap">{parsed.scores}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
