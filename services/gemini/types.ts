import { Part } from "@google/genai";

export type LogCallback = (message: string) => void;

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export const MODEL_CHAIN: string[] = [
  "gemini-3.5-flash-lite",
  "gemma-4-26b-a4b-it",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

export interface RetryRequestOptions<T> {
  operationName: string;
  systemInstruction: string;
  userPrompt: string;
  schema: unknown;
  temperature?: number;
  contextParts?: Part[];
  log: (msg: string) => void;
  parse: (raw: string) => T;
  firstAttemptLog?: string;
  retryLabel?: string;
  abortIf?: (err: Error) => string | null;
  failMessage?: (lastError: Error) => string;
}
