// site/src/config/contract.ts
//
// Thin re-export of the curated BuddyNFT ABI subset. The canonical source
// hoisted to `shared/buddyNftAbi.ts` so site and plugin share one file — no
// drift. Re-export shape preserved (`BUDDY_NFT_ABI`) so existing site-side
// imports keep working unchanged. ABI subset docs: `shared/buddyNftAbi.ts`.
//
// Reference: docs/network-config.md § ABI, § publicClient.

export { BUDDY_NFT_ABI } from '~shared/buddyNftAbi';
