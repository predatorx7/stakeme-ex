# Diwali theme

A subtle festive layer over `@reclaimprotocol/design`: warm diya light on a
night-sky canvas in dark mode, and marigold and saffron accents on a warm
paper canvas in light mode. It never fights the design system: it adjusts
tokens and adds restrained effects. Readability, contrast (WCAG AA), focus
rings, and `prefers-reduced-motion` always win.

## Shared contract

Every theme file uses only these custom properties and hooks. The tokens file
defines them in both themes; the effects file implements the hooks.

| Token | Meaning |
| --- | --- |
| `--smx-dw-gold` | Diya gold, for hairlines and highlights |
| `--smx-dw-marigold` | Marigold orange, the primary festive accent |
| `--smx-dw-saffron` | Saffron, for warm fills and positive moments |
| `--smx-dw-maroon` | Deep maroon, for depth and danger-adjacent accents |
| `--smx-dw-rose` | Rangoli pink, for small decorative accents |
| `--smx-dw-glow` | Soft warm `box-shadow` for diya glow on hover |
| `--smx-dw-hairline` | Gold gradient used for 1px festive borders |
| `--smx-dw-canvas` | Page background layer (night sky or warm paper) |
| `--smx-dw-rangoli` | Very faint repeating rangoli pattern (`background-image`) |

| Hook | Effect |
| --- | --- |
| `.smx-dw-glow` | Warm glow on hover and focus-visible (cards, tiles) |
| `.smx-dw-hairline` | Gold gradient top hairline on a surface |
| `[data-dw-sparkle]` | Small sparkle burst when the element is clicked |
| `smx:celebrate` (DOM event) | Brief sparkler burst near the event target |
| `.smx-dw-diya` | Gentle flicker for a small light accent (status dot) |

## Ownership

| File | Owner |
| --- | --- |
| `public/styles/diwali-tokens.css` | Tokens agent |
| `public/styles/diwali-effects.css`, `src/client/diwali-effects.ts` | Effects agent |
| `public/styles/diwali-components.css` | Shared components agent |
| `public/styles/diwali-shell.css`, `Header.tsx`, `Layout.tsx`, `WalletDialogs.tsx` | Shell agent |
| `public/styles/diwali-exchange.css`, `pages/ExchangePage.tsx` | Exchange agent |
| `public/styles/diwali-creator.css`, `pages/CreatorPage.tsx` | Creator page agent |
| `public/styles/diwali-hub.css`, `pages/CreatorHubPage.tsx` | Hub agent |
| `public/styles/diwali-launch.css`, `pages/LaunchPage.tsx` | Launch agent |

The mock bank (`MockBankPage.tsx`) stays unthemed: it imitates a bank.
