import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Fontsource imports. Weight 400 is body; 600 is section headers; 700 is
// the terminal title.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

// Global stylesheet — tokens, reset, page-level gradient. Imported after
// fontsource so @font-face declarations resolve before our body
// font-family references them.
import './styles/global.css';

import App from './App';

// `WagmiProvider` + `RainbowKitProvider` + the RainbowKit modal stylesheet
// mount inside `layouts/HatchLayout.tsx`, which is lazy-loaded only when a
// user navigates to `/hatch`. Cold-load on `/`, `/view`, `/view/<uuid>`, and
// `/bond` does not pay the wagmi + RainbowKit chunk download cost.
//
// `QueryClientProvider` STAYS at root: `useBuddyLookup` (the wallet-free
// `/view/<uuid>` data layer) depends on a `QueryClient` in context, and
// keeping it here means a single client serves both the public-read query
// graph AND the wagmi-piggybacked queries on `/hatch`.

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

// React Query client — a single instance per app per the TanStack docs.
// Used by `useBuddyLookup` on `/view/<uuid>` and (transitively) by
// wagmi v2's hooks under `/hatch`.
const queryClient = new QueryClient();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
