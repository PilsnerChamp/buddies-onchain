# Third-Party Notices

The published plugin artifact `dist/index.js` is a single bundled file produced
by `bun build` (see `package.json` → `build`). It inlines the project source
together with third-party runtime dependencies whose own license headers the
bundler strips. Those dependencies and their copyright notices are reproduced
below to satisfy their license terms when this bundle is redistributed (e.g.
through the Claude Code plugin marketplace).

All are MIT-licensed. The MIT permission notice (reproduced once at the end)
applies to each, under the respective copyright holders.

Currently inlined into `dist/index.js`:

- **viem** — Copyright (c) 2023-present weth, LLC — <https://github.com/wevm/viem>
- **abitype** — Copyright (c) 2022-present weth, LLC — <https://github.com/wevm/abitype>
- **ox** — Copyright (c) 2023-present wevm — <https://github.com/wevm/ox>
- **@noble/curves** — Copyright (c) 2022 Paul Miller (https://paulmillr.com) — <https://github.com/paulmillr/noble-curves>
- **@noble/hashes** — Copyright (c) 2022 Paul Miller (https://paulmillr.com) — <https://github.com/paulmillr/noble-hashes>

`viem`'s wider transitive tree (also MIT) — included only if a future build
inlines it; listed here so attribution is ready:

- **isows** — Copyright (c) 2023-present weth, LLC — <https://github.com/wevm/isows>
- **@noble/ciphers** — Copyright (c) 2022 Paul Miller (https://paulmillr.com); portions Copyright (c) Thomas Pornin — <https://github.com/paulmillr/noble-ciphers>
- **@scure/bip32** — Copyright (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) — <https://github.com/paulmillr/scure-bip32>
- **@scure/bip39** — Copyright (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) — <https://github.com/paulmillr/scure-bip39>

`viem` is the sole direct dependency; the bundled set is whatever it transitively
pulls in. Regenerate this file (verify against `dist/index.js`) if that set changes.

---

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
