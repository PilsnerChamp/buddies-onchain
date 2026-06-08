/**
 * Local sleeping-buddy renderer for cold/unknown surfaces.
 *
 * Mirrors the on-chain blink frame `fb` from BuddyRenderer.sol:
 *   - frame 0 body slice
 *   - row-0 hat injection when the row is blank and hat != "none"
 *   - eye sentinel "0" -> "-" (blink)
 *
 * Sync. No RPC. No disk. No cache.
 *
 * The seed path matches `BuddyNFT.hatch`: UUID -> identityHash -> raw32 plus
 * SEED_DOMAIN -> wyhash -> Mulberry32 traits.
 */

import { deriveBuddyFromAccount } from "./bone-deriver";
import { BODY_FRAME_0, HAT_ROWS } from "./sleeping-atlas";

const EYE_PLACEHOLDER = "0";
const BLINK_GLYPH = "-";

function isBlankRow(row: string): boolean {
  for (const ch of row) if (ch !== " ") return false;
  return true;
}

export function sleepingFrame(args: { accountUuid: string }): {
  rows: string[];
  frameId: "fb";
} {
  const { bones } = deriveBuddyFromAccount(args.accountUuid);

  const baseRows = BODY_FRAME_0[bones.species];

  const rows = baseRows.map((row, idx) => {
    let next = row;
    if (idx === 0 && bones.hat !== "none" && isBlankRow(next)) {
      next = `  ${HAT_ROWS[bones.hat]}  `;
    }
    return next.replaceAll(EYE_PLACEHOLDER, BLINK_GLYPH).replace(/\s+$/, "");
  });

  return { rows, frameId: "fb" };
}
