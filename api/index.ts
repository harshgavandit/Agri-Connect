import type { Request, Response } from "express";
import app, { ready } from "../backend/index";

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
