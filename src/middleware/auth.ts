import { Request, Response, NextFunction } from "express";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"];
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    res.status(500).json({ error: "Server misconfigured: no API key set" });
    return;
  }

  if (apiKey !== expected) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }

  next();
}
