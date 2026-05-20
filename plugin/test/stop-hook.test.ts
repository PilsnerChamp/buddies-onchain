import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearDriftFlag,
  consumeExpectedRender,
  isDriftFlagSet,
  setExpectedRender,
} from "../src/drift-flag";
import { processStop, type StopHookInput } from "../src/stop-hook";

const tmpDirs: string[] = [];
let originalClaudeDir: string | undefined;

function freshTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-stop-hook-"));
  tmpDirs.push(dir);
  return dir;
}

function renderedBuddyBlock(): string {
  return [
    "```",
    "  .[||].  | self owns",
    " [ x  x ] | barely useful",
    " [ ==== ] | chain goblin",
    " `------´ |",
    "```",
  ].join("\n");
}

function assistantEntry(content: unknown[]): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content,
    },
  });
}

function assistantEntryWithoutNestedRole(content: unknown[]): string {
  return JSON.stringify({
    type: "assistant",
    message: { content },
  });
}

function userEntry(text: string): string {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: text,
    },
  });
}

function systemEntry(text: string): string {
  return JSON.stringify({ type: "system", message: { role: "system", content: text } });
}

function writeTranscript(lines: string[]): string {
  const path = join(freshTmp(), "transcript.jsonl");
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

async function run(input: StopHookInput | null): Promise<string[]> {
  const stdout: string[] = [];
  await processStop(input, () => { stdout.push("{}"); });
  return stdout;
}

beforeEach(() => {
  originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = freshTmp();
  consumeExpectedRender();
  clearDriftFlag();
});

afterEach(() => {
  if (originalClaudeDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
  }

  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("processStop", () => {
  test("expected-render not set short-circuits without drift", async () => {
    const out = await run({
      transcript_path: join(freshTmp(), "missing.jsonl"),
    });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("expected-render set plus rendered buddy block clears expected without drift", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntry([{ type: "text", text: renderedBuddyBlock() }]),
    ]);

    const out = await run({ transcript_path: transcript });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("expected-render set plus text with no buddy block sets drift", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntry([{ type: "text", text: "plain answer without the sprite" }]),
    ]);

    const out = await run({ transcript_path: transcript });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(true);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("expected-render set plus tool-only assistant message does not set drift", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntry([{ type: "tool_use", id: "toolu_1", name: "Read", input: {} }]),
    ]);

    const out = await run({ transcript_path: transcript });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("last_assistant_message is preferred over transcript fallback", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntry([{ type: "text", text: "transcript would drift if read" }]),
    ]);

    const out = await run({
      last_assistant_message: renderedBuddyBlock(),
      transcript_path: transcript,
    });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("missing last_assistant_message falls back to JSONL transcript parse", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntryWithoutNestedRole([
        { type: "text", text: "top-level assistant entry forgot the sprite" },
      ]),
    ]);

    const out = await run({ transcript_path: transcript });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(true);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("missing transcript soft-fails without drift and clears expected-render", async () => {
    setExpectedRender();

    const out = await run({ transcript_path: join(freshTmp(), "missing.jsonl") });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("walks past trailing non-assistant JSONL entries to the last assistant", async () => {
    setExpectedRender();
    const transcript = writeTranscript([
      assistantEntry([{ type: "text", text: "assistant forgot the sprite" }]),
      userEntry("thanks"),
      systemEntry("session metadata"),
    ]);

    const out = await run({ transcript_path: transcript });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(true);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("slash turn with expected-render unset short-circuits without false drift", async () => {
    const out = await run({
      last_assistant_message: [
        "go see your buddy onchain:",
        "https://buddies-onchain.xyz/view/abc",
        "your buddy appears on every user prompt (mode: `full`).",
      ].join("\n"),
    });

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(false);
  });

  test("malformed stdin path represented by null input emits empty without flag mutation", async () => {
    setExpectedRender();

    const out = await run(null);

    expect(out).toEqual(["{}"]);
    expect(isDriftFlagSet()).toBe(false);
    expect(consumeExpectedRender()).toBe(true);
  });
});
