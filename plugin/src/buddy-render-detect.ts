const OPENING_FENCE_RE = /^\s*(```|~~~)(\w*)\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}/;
const MIN_BODY_ROWS = 3;
const MAX_BODY_ROWS = 8;
const MAX_NON_EMPTY_LINES_BEFORE_FENCE = 3;

function tagQualifies(tag: string): boolean {
  return tag === "" || tag === "text" || tag === "txt";
}

function isClosingFence(line: string, fence: string): boolean {
  return line.trim() === fence;
}

export function detectBuddyRender(assistantText: string): boolean {
  if (assistantText.trim() === "") {
    return false;
  }

  const lines = assistantText.split(/\r?\n/);
  let seenNonEmpty = 0;
  let openingIndex = -1;
  let openingFence = "";

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      continue;
    }

    seenNonEmpty++;
    if (seenNonEmpty > MAX_NON_EMPTY_LINES_BEFORE_FENCE) {
      return false;
    }

    const match = lines[i].match(OPENING_FENCE_RE);
    if (match === null) {
      continue;
    }

    if (!tagQualifies(match[2])) {
      return false;
    }

    openingIndex = i;
    openingFence = match[1];
    break;
  }

  if (openingIndex === -1) {
    return false;
  }

  let closingIndex = -1;
  for (let i = openingIndex + 1; i < lines.length; i++) {
    if (isClosingFence(lines[i], openingFence)) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return false;
  }

  const body = lines.slice(openingIndex + 1, closingIndex);
  if (body.length < MIN_BODY_ROWS || body.length > MAX_BODY_ROWS) {
    return false;
  }

  if (body.some((line) => TABLE_SEPARATOR_RE.test(line))) {
    return false;
  }

  const pipeRows = body.filter((line) => line.includes("|")).length;
  return pipeRows >= Math.max(MIN_BODY_ROWS, Math.ceil(0.6 * body.length));
}
