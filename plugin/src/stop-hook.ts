import { readFileSync } from "node:fs";
import { detectBuddyRender } from "./buddy-render-detect";
import { consumeExpectedRender, setDriftFlag } from "./drift-flag";
import { isPlainObject } from "./plain-object";

export interface StopHookInput {
  session_id?: string;
  transcript_path?: string;
  hook_event_name?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

type Emit = () => void;

function emitEmpty(): void {
  console.log("{}");
}

async function readStopHookInput(timeoutMs = 200): Promise<StopHookInput | null> {
  if (process.stdin.isTTY) return null;
  return new Promise<StopHookInput | null>((resolve) => {
    let buf = "";
    const finish = (): void => {
      const trimmed = buf.trim();
      if (trimmed.length === 0) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          resolve(null);
          return;
        }
        resolve(parsed as StopHookInput);
      } catch {
        resolve(null);
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c: string) => { buf += c; });
    process.stdin.on("end", () => { clearTimeout(timer); finish(); });
    process.stdin.on("error", () => { clearTimeout(timer); finish(); });
  });
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!isPlainObject(item)) return "";
      return item.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .join("");
}

function assistantTextFromEntry(entry: unknown): string | null {
  if (!isPlainObject(entry)) {
    return null;
  }

  const message = isPlainObject(entry.message) ? entry.message : null;
  const nestedRole = message?.role;
  const isAssistant =
    nestedRole === "assistant" ||
    (nestedRole === undefined && entry.type === "assistant");

  if (!isAssistant || message === null) {
    return null;
  }

  return textFromContent(message.content);
}

function assistantTextFromTranscript(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }

  try {
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const text = assistantTextFromEntry(JSON.parse(lines[i]));
        if (text !== null) {
          return text;
        }
      } catch {
        // Corrupt JSONL entries are skipped; newer valid entries still win.
      }
    }
  } catch {
    return null;
  }

  return null;
}

function resolveAssistantText(input: StopHookInput): string | null {
  if (
    typeof input.last_assistant_message === "string" &&
    input.last_assistant_message.length > 0
  ) {
    return input.last_assistant_message;
  }

  return assistantTextFromTranscript(input.transcript_path);
}

export async function processStop(
  input: StopHookInput | null,
  emit: Emit = emitEmpty,
): Promise<void> {
  let emitted = false;
  const done = (): void => {
    if (emitted) return;
    emitted = true;
    emit();
  };

  try {
    if (input === null) {
      done();
      return;
    }

    const expected = consumeExpectedRender();
    if (!expected) {
      done();
      return;
    }

    const text = resolveAssistantText(input);
    if (text === null || text.trim() === "") {
      done();
      return;
    }

    if (!detectBuddyRender(text)) {
      try {
        setDriftFlag();
      } catch {
        // Drift flag writes are best-effort; Stop hook never blocks.
      }
    }

    done();
  } catch {
    done();
  }
}

export async function runStopHook(): Promise<void> {
  try {
    await processStop(await readStopHookInput());
  } catch {
    emitEmpty();
  }
}
