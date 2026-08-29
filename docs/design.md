# Design Constraints & Harness

This document captures the UI/UX design rules, layout constraints, and visual consistency requirements for the Blast Radius frontend. All agents and contributors must follow these when making frontend changes.

---

## Layout

- **Max width:** `max-w-7xl` centered with `mx-auto`, horizontal padding `px-4 md:px-8`.
- **Vertical rhythm:** sections are spaced with `gap-6` in a flex column.
- **Cards/sections:** use `rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm`.
- **Inner panels:** use `rounded-xl border border-zinc-200 bg-zinc-50 p-4`.

## Color palette

- **Background:** `bg-zinc-50` (page), `bg-white` (cards), `bg-zinc-50` (inner panels).
- **Text:** `text-zinc-900` (primary), `text-zinc-600` (secondary), `text-zinc-500` (muted/hints).
- **Accent — active/selected:** `border-emerald-300 bg-emerald-50 text-emerald-800`.
- **Accent — focused graph node:** `border-sky-500 bg-sky-50`.
- **Destructive:** `text-red-600 hover:bg-red-50` for delete actions.
- **Errors:** `border-red-200 bg-red-50 text-red-700`.
- **Buttons (primary):** `bg-black text-white` (small: `px-2.5 py-1 text-xs`, medium: `px-4 py-2 text-sm`).
- **Buttons (secondary):** `border border-zinc-300 bg-white text-zinc-700`.
- **Disabled:** `disabled:cursor-not-allowed disabled:opacity-60` or `disabled:bg-zinc-300`.

## Typography

- **Headings:** `text-2xl font-bold tracking-tight` (page title), `text-lg font-semibold` (section), `text-sm font-semibold` (labels/sub-headings).
- **Body:** `text-sm` for most content.
- **Hints/tips:** `text-xs text-zinc-500`.
- **Monospace/code:** `text-xs` in `<pre>` with `whitespace-pre-wrap`.

## Inputs

- **Text inputs:** `h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400`.
- **Textareas:** same border/focus style, `px-3 py-2`.
- **Number inputs:** same as text inputs.

## Tabs

- **Active:** `rounded-full bg-black px-4 py-2 text-sm font-semibold text-white`.
- **Inactive:** `rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100`.

## Tab content areas

- **All tab panels must have the same fixed height:** `h-120`.
- The graph tab uses `overflow-hidden` (React Flow handles its own scroll).
- The affected pages tab uses `overflow-auto` so the list scrolls within the container.
- The prompt tab uses a flex column layout (`flex h-120 flex-col`) with the `<pre>` taking `flex-1 min-h-0 overflow-auto`.

## Modals / Dialogs

- Use the native `<dialog>` element with `open` attribute (not `showModal()`).
- Animate open/close with transition states (`opacity` + `translate-y` + `scale`), duration `200ms`.
- Close transition uses a `180ms` timer before unmounting.
- Block close (button + Escape) when a background job is active (`isJobActive` guard).
- Backdrop click closes via `onClick` on the centering wrapper div.
- `onCancel` always calls `event.preventDefault()` and delegates to the close handler.

## Repo cards (3×3 grid)

- Grid: `grid grid-cols-3 gap-2` inside a `rounded-lg border border-zinc-200 bg-zinc-50 p-2`.
- Cards: `group relative rounded-md border` with hover menu.
- Ellipsis menu: appears on hover (`opacity-0 group-hover:opacity-100`), absolutely positioned top-right.
- Dropdown: `absolute right-0 z-20 mt-1 w-40 rounded-md border bg-white p-1 shadow-lg`.

## Icons

- Use inline SVGs (no icon library dependency).
- Standard size: `h-3.5 w-3.5` for small actions, `h-4 w-4` for toolbar.
- Always include `aria-hidden="true"` on decorative icons.

## Search / Autocomplete

- Debounce: `220ms` delay before firing API requests.
- Results capped to **5 items** (enforced server-side via `LIMIT 5`).
- Dropdown: `absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white p-1 shadow-lg`.
- Selection: `onMouseDown` with `event.preventDefault()` to avoid blur race.
- Close on blur with `120ms` delay.

## Error display

- Global error bar at the bottom: `rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700`.
- Inline job failure: `rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700`.

## Loading states

- Spinner: use `animate-spin` on the refresh icon.
- Pending buttons: change label text (e.g., "Running blast..." / "Starting...").
- Skeleton text: `text-sm text-zinc-500` placeholder messages.

## Accessibility

- All interactive elements must have `type="button"` on non-submit buttons.
- Ellipsis menus: use `aria-label` describing the target (e.g., `Open options for {repoName}`).
- Dialogs: use `aria-label` on the `<dialog>` element.
- Focus management: dialog close returns focus naturally (native `<dialog>` behavior).

## Responsiveness

- Query section: `lg:grid-cols-3` (controls 1/3, results 2/3).
- Repo grid: fixed `grid-cols-3` (acceptable at current scale).
- Modal: `max-w-2xl` centered with `px-4` margin.
- Tab bar: `flex flex-wrap gap-2` to wrap on small screens.
