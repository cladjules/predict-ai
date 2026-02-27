import { Request, Response, NextFunction } from "express";

export const apiKeyMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = req.headers["x-api-key"];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.warn("⚠️  API_KEY not set in environment - API key check disabled");
    return next();
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized - Invalid API key" });
  }

  next();
};
