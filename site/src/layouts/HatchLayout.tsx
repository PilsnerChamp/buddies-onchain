// site/src/layouts/HatchLayout.tsx
//
// Wallet-stack layout for `/hatch`. Pulled out of the root tree so
// `WagmiProvider` + `RainbowKitProvider` only mount when a user actually
// navigates to `/hatch`. Other routes (`/`,
// `/view`, `/view/<uuid>`, `/bond`) don't pay the wallet-stack context tax
// AND don't pay the wallet-stack download cost — `App.tsx` references this
// module via `React.lazy`, so Vite emits a separate chunk for the wagmi +
// RainbowKit graph that loads on demand only.
//
// Critical: the RainbowKit modal stylesheet (`@rainbow-me/rainbowkit/
// styles.css`) MUST be imported here, NOT in `main.tsx`. Vite chunks CSS
// with the JS module that imports it; keeping the CSS in the entry would
// leave the wagmi-CSS bytes in the root bundle and the bundle split would
// be incomplete (the JS chunk would split, the CSS chunk would not).
//
// `wagmiConfig` is constructed eagerly at the top of `config/wagmi.ts`. As
// long as this layout is the only consumer of `config/wagmi`, the eager
// construction also defers because the `config/wagmi` module is reached only
// via the dynamic import graph rooted at this layout.

import { Outlet } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '../config/wagmi';

// RainbowKit's modal stylesheet — kept inside this module so it travels in
// the same lazy chunk as the providers. Loaded only when /hatch is visited.
import '@rainbow-me/rainbowkit/styles.css';

// Default export so `React.lazy(() => import('./layouts/HatchLayout'))`
// resolves without a `.then((m) => ({ default: m.HatchLayout }))` shim.
export default function HatchLayout(): JSX.Element {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider theme={darkTheme()}>
        <Outlet />
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
