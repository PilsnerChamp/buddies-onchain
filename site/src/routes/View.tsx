// site/src/routes/View.tsx
//
// Bare `/view` route — the lookup console in its "no arg supplied" state.
// All lookup behavior (dual-grammar input, UUID-in-component-state-only
// resolution, navigation) lives in `<LookupConsole>`, shared with the
// `/view/<tokenId>` miss state.

import { LookupConsole } from '../components/LookupConsole';

import './View.css';

export function View(): JSX.Element {
  return <LookupConsole variant={{ kind: 'bare' }} />;
}
