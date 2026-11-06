# 05: Diwali theme

Summary reconstructed from the repository. Source: `docs/diwali-theme.md`.

## Direction

Humans asked for a festive Diwali look on top of the Reclaim design system.
The spec describes it as:

> A subtle festive layer over `@reclaimprotocol/design`: warm diya light on a
> night-sky canvas in dark mode, and marigold and saffron accents on a warm
> paper canvas in light mode.

Constraint stated in the spec:

> Readability, contrast (WCAG AA), focus rings, and `prefers-reduced-motion` always win.

## How the work was delegated

The lead agent wrote a shared contract (custom properties `--smx-dw-*` and
hooks such as `.smx-dw-glow`, `[data-dw-sparkle]`, `smx:celebrate`), then gave
each file to a separate agent: tokens, effects, shared components, shell,
exchange, creator, hub, and launch. The ownership table is in
`docs/diwali-theme.md`.

## Exception

"The mock bank (`MockBankPage.tsx`) stays unthemed: it imitates a bank."
