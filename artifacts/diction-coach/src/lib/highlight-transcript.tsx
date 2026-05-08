
const FILLER_WORDS = ['um', 'uh', 'like', 'basically', 'literally'];
const HEDGING_PHRASES = ['i think', 'maybe', 'sort of', 'kind of', 'hopefully', 'just', 'try to'];

export function HighlightedTranscript({ text }: { text: string }) {
  if (!text) return null;

  // Build a regex that matches any of the phrases
  // Sort by length descending so longer phrases are matched first
  const allPhrases = [...FILLER_WORDS, ...HEDGING_PHRASES].sort((a, b) => b.length - a.length);
  const regexPattern = `\\b(${allPhrases.join('|')})\\b`;
  const regex = new RegExp(regexPattern, 'gi');

  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const lowerPart = part.toLowerCase();
        if (FILLER_WORDS.includes(lowerPart)) {
          return <span key={i} className="text-highlight-filler">{part}</span>;
        }
        if (HEDGING_PHRASES.includes(lowerPart)) {
          return <span key={i} className="text-highlight-hedging">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
