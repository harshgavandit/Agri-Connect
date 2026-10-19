import type { Express, Request, Response } from "express";
import { createRequire } from "node:module";

// Load the production bundle instead of Vercel's unbundled ESM output, where
// the application's extensionless TypeScript imports cannot resolve in Node.
const require = createRequire(import.meta.url);
const { default: app, ready } = require("../dist/index.cjs") as {
  default: Express;
  ready: Promise<void>;
};

// Share initialization between concurrent requests in the same warm instance.
// Express keeps the original /api URL and owns auth, validation, and webhooks.
export default async function handler(req: Request, res: Response) {
  try {
    await ready;
  } catch {
    console.error("[startup] API initialization failed");
    return res.status(503).json({ error: "Service initialization unavailable" });
  }
  return app(req, res);
}
