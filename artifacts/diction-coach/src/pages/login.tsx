import { useAuth } from "@workspace/replit-auth-web";
import { Mic, Video, Brain, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { login, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <Mic className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Diction Coach</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
            AI-powered executive presentation coaching for Deloitte Partner panel preparation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: Video, title: "Video analysis", desc: "Camera feedback on body language & composure" },
            { icon: Brain, title: "AI coaching", desc: "Senior Partner-level critique from Claude" },
            { icon: TrendingUp, title: "Track progress", desc: "Session history to measure improvement" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="mt-0.5 p-1.5 rounded-md bg-primary/10">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={login}
          disabled={isLoading}
        >
          Sign in to start coaching
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Your recordings and feedback are private to your account.
        </p>
      </div>
    </div>
  );
}
