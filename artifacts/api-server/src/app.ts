import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Support both direct API keys (OPENAI_API_KEY / ANTHROPIC_API_KEY) and
// Replit-managed AI integration vars (AI_INTEGRATIONS_*). When only the
// standard keys are set, bridge them so the integration clients work too.
if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.OPENAI_API_KEY) {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://api.openai.com/v1";
}
if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

export default app;
