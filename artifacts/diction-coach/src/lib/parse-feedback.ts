export function parseFeedback(markdown: string) {
  const sections = {
    scores: "",
    critique: "",
    drill: "",
    rewrite: "",
    followUp: "",
  };

  if (!markdown) return sections;

  const lines = markdown.split('\n');
  let currentSection = "";

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes("partner panel scores") || lowerLine.includes("the four c")) {
      currentSection = "scores";
    } else if (lowerLine.includes("the critique")) {
      currentSection = "critique";
    } else if (lowerLine.includes("today's drill") || lowerLine.includes("todays drill")) {
      currentSection = "drill";
    } else if (lowerLine.includes("bluf rewrite") || lowerLine.includes("the pointed rewrite") || lowerLine.includes("pointed rewrite")) {
      currentSection = "rewrite";
    } else if (lowerLine.includes("panel follow-up question") || lowerLine.includes("follow up") || lowerLine.includes("follow-up")) {
      currentSection = "followUp";
    } else if (currentSection) {
      sections[currentSection as keyof typeof sections] += line + "\n";
    }
  }

  for (const key in sections) {
    sections[key as keyof typeof sections] = sections[key as keyof typeof sections].trim();
  }

  if (!sections.scores && !sections.critique && !sections.rewrite && !sections.followUp) {
    sections.critique = markdown;
  }

  return sections;
}

export function parseScores(scoresText: string): { label: string; score: number }[] {
  const lines = scoresText.split('\n');
  const results: { label: string; score: number }[] = [];
  for (const line of lines) {
    const match = line.match(/\*?\*?([^:*\[\n]+?)\*?\*?:\s*(?:\[Score\s*)?(\d+)(?:\/10)?(?:\s*—[^\]]*)?(?:\])?/i);
    if (match) {
      const score = parseInt(match[2]);
      if (score >= 1 && score <= 10) {
        results.push({ label: match[1].trim(), score });
      }
    }
  }
  return results;
}

// Fixed Four C's brand colors — always use these regardless of score value
const FOUR_CS_COLORS: Record<string, string> = {
  clarity: "#60a5fa",      // blue
  confidence: "#fbbf24",   // amber
  conciseness: "#34d399",  // green
  connection: "#fb7185",   // rose
  presence: "#a78bfa",     // purple
};

export function scoreRingColor(label: string, score: number): string {
  const key = label.toLowerCase().split(/\s*[\(&]/)[0].trim();
  for (const [keyword, color] of Object.entries(FOUR_CS_COLORS)) {
    if (key.includes(keyword)) return color;
  }
  // Fallback: performance-based coloring
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#3b82f6";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

const ALL_FILLERS = [
  'you know', 'sort of', 'kind of',
  'um', 'uh', 'like', 'basically', 'literally',
  'actually', 'honestly', 'right', 'just',
];

export function countFillerWords(text: string): { word: string; count: number }[] {
  if (!text) return [];
  const results: { word: string; count: number }[] = [];
  for (const word of ALL_FILLERS) {
    const escaped = word.replace(/\s+/g, '\\s+');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      results.push({ word, count: matches.length });
    }
  }
  return results.sort((a, b) => b.count - a.count);
}
