export type BuddyStatus = "warm" | "cold" | "unknown";
export type BuddyStatusUrlTarget = "view" | "hatch";

export interface BuddyStatusMessage {
  message: string;
  urlTarget: BuddyStatusUrlTarget;
}

const STATUS_MESSAGES: Record<BuddyStatus, BuddyStatusMessage> = {
  warm: {
    message: "go see your buddy onchain:",
    urlTarget: "view",
  },
  cold: {
    message: "your buddy is sleeping - not yet hatched onchain:",
    urlTarget: "hatch",
  },
  unknown: {
    message: "unable to verify onchain status - try online:",
    urlTarget: "hatch",
  },
};

export function resolveBuddyStatusMessage(args: {
  buddyStatus: BuddyStatus;
}): BuddyStatusMessage {
  return { ...STATUS_MESSAGES[args.buddyStatus] };
}
