import { useGetSessions, getGetSessionsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, Clock, Zap, Calendar, TrendingUp, Activity } from "lucide-react";
import { parseFeedback, parseScores, scoreRingColor } from "@/lib/parse-feedback";

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

function MiniScoreBadge({ label, score }: { label: string; score: number }) {
  const color = scoreRingColor(label, score);
  const shortLabel = label.split("&")[0].split(" ").slice(0, 2).join(" ").trim();
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg font-bold" style={{ color }}>{score}</span>
      <span className="text-[10px] text-muted-foreground leading-tight text-center max-w-[56px]">{shortLabel}</span>
    </div>
  );
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

  const sessions = data?.sessions ?? [];
  const avgWpm = sessions.length
    ? Math.round(sessions.reduce((s, x) => s + x.wpm, 0) / sessions.length)
    : null;

  return (
    <div className="min-h-screen bg-background px-4 py-10 font-sans">
      <div className="w-full max-w-4xl mx-auto space-y-6">

        {/* Header */}
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

        {/* Stats summary bar */}
        {sessions.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sessions", value: sessions.length, icon: Mic, color: "text-primary" },
              { label: "Avg WPM", value: avgWpm ?? "—", icon: Zap, color: wpmColor(avgWpm ?? 130) },
              {
                label: "Best score", icon: TrendingUp, color: "text-green-400",
                value: (() => {
                  const allScores = sessions.flatMap(s =>
                    s.feedback ? parseScores(parseFeedback(s.feedback).scores).map(x => x.score) : []
                  );
                  return allScores.length ? Math.max(...allScores) : "—";
                })(),
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="border-border bg-card shadow-sm">
                <CardContent className="pt-4 pb-3 flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <div>
                    <div className={`text-xl font-bold ${color}`}>{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Voice Fingerprint */}
        {sessions.length >= 2 && (() => {
          const allParsed = sessions
            .filter(s => s.feedback)
            .map(s => parseScores(parseFeedback(s.feedback!).scores));

          // Build per-label averages across sessions
          const labelTotals: Record<string, { sum: number; count: number }> = {};
          for (const sessionScores of allParsed) {
            for (const { label, score } of sessionScores) {
              const key = label.split("(")[0].trim();
              if (!labelTotals[key]) labelTotals[key] = { sum: 0, count: 0 };
              labelTotals[key].sum += score;
              labelTotals[key].count += 1;
            }
          }
          const fingerprint = Object.entries(labelTotals)
            .filter(([, v]) => v.count >= 2)
            .map(([label, { sum, count }]) => ({ label, avg: Math.round((sum / count) * 10) / 10 }))
            .sort((a, b) => b.avg - a.avg);

          if (fingerprint.length === 0) return null;

          return (
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Voice Fingerprint
                  </CardTitle>
                  <span className="text-xs text-muted-foreground ml-auto">{sessions.length} sessions</span>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5">
                {fingerprint.map(({ label, avg }) => {
                  const color = scoreRingColor(label, Math.round(avg));
                  const pct = (avg / 10) * 100;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">{label}</span>
                        <span className="font-bold" style={{ color }}>{avg}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground pt-1">Running averages across all saved sessions.</p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && sessions.length === 0 && (
          <div className="text-center py-20 space-y-2">
            <Mic className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
            <p className="text-muted-foreground text-sm">No sessions yet. Record your first practice!</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Start practicing
            </Button>
          </div>
        )}

        {/* Session Cards */}
        <div className="space-y-4">
          {sessions.map((session) => {
            const parsed = session.feedback ? parseFeedback(session.feedback) : null;
            const scores = parsed?.scores ? parseScores(parsed.scores) : [];
            const avg = scores.length
              ? (scores.reduce((s, x) => s + x.score, 0) / scores.length)
              : null;

            return (
              <Card key={session.id} className="border-border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate">
                        {session.promptLabel || "Free-form practice"}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                    {/* Overall score badge */}
                    {avg !== null && (
                      <div className="text-center shrink-0">
                        <div className="text-2xl font-bold" style={{ color: scoreRingColor("overall", Math.round(avg)) }}>
                          {avg.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">/ 10</div>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Mini score row */}
                  {scores.length > 0 && (
                    <div className="flex items-center gap-4 px-3 py-3 rounded-lg bg-muted/20 border border-border/50">
                      {scores.map(({ label, score }) => (
                        <MiniScoreBadge key={label} label={label} score={score} />
                      ))}
                    </div>
                  )}

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
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
