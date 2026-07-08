import "dotenv/config";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function jwtSecret() {
  const secret = process.env.JWT_SECRET || "dev-only-secret-change-me";
  if (process.env.NODE_ENV === "production" && secret === "dev-only-secret-change-me") {
    throw new Error("JWT_SECRET is required in production.");
  }

  return secret;
}

