/**
 * Pure UserPromptSubmit router for the merged buddy command surface.
 *
 * Only `/buddy-onchain` is special. Bare command performs a live lookup;
 * valid verbs mutate local ambient preference without RPC. Everything else
 * is ambient and never reaches command logic.
 */

import type { ModeLevel } from "./buddy-state";

export type CommandRoute =
  | { kind: "lookup" }
  | { kind: "mutate"; verb: ModeLevel }
  | { kind: "invalid"; verb: string }
  | { kind: "ambient" };

const BUDDY_COMMANDS = new Set([
  "/buddy-onchain",
  "/buddy-onchain:buddy-onchain",
]);

function isModeVerb(value: string): value is ModeLevel {
  return value === "off" || value === "lite" || value === "full";
}

export function routePrompt(rawPrompt: string | undefined | null): CommandRoute {
  if (rawPrompt === undefined || rawPrompt === null) {
    return { kind: "ambient" };
  }

  const prompt = rawPrompt.trim();
  if (prompt === "") {
    return { kind: "ambient" };
  }

  const tokens = prompt.split(/\s+/);
  const command = tokens[0];

  if (!BUDDY_COMMANDS.has(command)) {
    return { kind: "ambient" };
  }

  const verb = tokens[1];
  if (verb === undefined) {
    return { kind: "lookup" };
  }

  const normalized = verb.toLowerCase();
  if (isModeVerb(normalized)) {
    return { kind: "mutate", verb: normalized };
  }

  return { kind: "invalid", verb };
}
