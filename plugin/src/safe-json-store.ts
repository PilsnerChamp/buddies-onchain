import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type JsonValidator<T> = (raw: unknown) => T | null;

const O_NOFOLLOW =
  typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;

function parentIsSafe(path: string): boolean {
  try {
    const st = lstatSync(dirname(path));
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

function targetIsSafeForRead(path: string, maxBytes: number): boolean {
  try {
    const st = lstatSync(path);
    return st.isFile() && !st.isSymbolicLink() && st.size <= maxBytes;
  } catch {
    return false;
  }
}

function targetIsSafeForWrite(path: string): boolean {
  try {
    return !lstatSync(path).isSymbolicLink();
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT";
  }
}

export function safeReadJson<T>(
  path: string,
  validate: JsonValidator<T>,
  maxBytes: number,
): T | null {
  try {
    if (!parentIsSafe(path) || !targetIsSafeForRead(path, maxBytes)) return null;
    let fd: number | undefined;
    let text: string;
    try {
      fd = openSync(path, fsConstants.O_RDONLY | O_NOFOLLOW);
      const buf = Buffer.alloc(maxBytes);
      const n = readSync(fd, buf, 0, maxBytes, 0);
      text = buf.subarray(0, n).toString("utf8");
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function safeWriteJson<T>(
  path: string,
  data: T,
  validate: JsonValidator<T>,
): boolean {
  let tempPath: string | null = null;
  try {
    const normalized = validate(data);
    if (normalized === null) return false;
    const json = JSON.stringify(normalized);
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    if (!parentIsSafe(path) || !targetIsSafeForWrite(path)) return false;

    tempPath = join(dir, `.json.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    let fd: number | undefined;
    try {
      fd = openSync(
        tempPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | O_NOFOLLOW,
        0o600,
      );
      writeSync(fd, json);
      try {
        fchmodSync(fd, 0o600);
      } catch {
        // Best effort on platforms that do not support POSIX chmod semantics.
      }
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    renameSync(tempPath, path);
    tempPath = null;
    return true;
  } catch {
    if (tempPath !== null) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Best effort cleanup.
      }
    }
    return false;
  }
}
