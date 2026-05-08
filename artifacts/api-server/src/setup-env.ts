if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.OPENAI_API_KEY) {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://api.openai.com/v1";
}
if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
}
