export function parseFeedback(markdown: string) {
  const sections = {
    scores: "",
    critique: "",
    rewrite: "",
    followUp: ""
  };

  if (!markdown) return sections;

  // Split by headers (assuming standard ### or ## format for the 4 sections)
  const lines = markdown.split('\n');
  let currentSection = "";
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes("partner panel scores")) {
      currentSection = "scores";
    } else if (lowerLine.includes("the critique")) {
      currentSection = "critique";
    } else if (lowerLine.includes("bluf rewrite") || lowerLine.includes("the pointed rewrite") || lowerLine.includes("pointed rewrite")) {
      currentSection = "rewrite";
    } else if (lowerLine.includes("panel follow-up question") || lowerLine.includes("follow up") || lowerLine.includes("follow-up")) {
      currentSection = "followUp";
    } else if (currentSection) {
      // Append line
      sections[currentSection as keyof typeof sections] += line + "\n";
    }
  }

  // Trim all
  for (const key in sections) {
    sections[key as keyof typeof sections] = sections[key as keyof typeof sections].trim();
  }

  // Fallback if parsing fails - just dump everything into critique
  if (!sections.scores && !sections.critique && !sections.rewrite && !sections.followUp) {
    sections.critique = markdown;
  }

  return sections;
}
