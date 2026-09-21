# Install / 導入 / 安裝 / 安装 / Cài đặt

| Language | | Reviewed by a native speaker? |
| --- | --- | --- |
| **English** | [`en.md`](en.md) | **Authoritative.** Written, not translated |
| **日本語** | [`ja.md`](ja.md) | **Written, not translated** |
| **繁體中文** | [`zh-TW.md`](zh-TW.md) | ⚠️ **No.** Machine-translated |
| **简体中文** | [`zh-CN.md`](zh-CN.md) | ⚠️ **No.** Machine-translated |
| **Tiếng Việt** | [`vi.md`](vi.md) | ⚠️ **No.** Machine-translated |

## Why the warning labels

The three translated pages were produced by machine and **no native speaker has read them**.
They are published anyway, because a rough guide in your language beats no guide at all —
but **you should know which is which**.

`en.md` is the source of truth. Where a translation disagrees with it, the English is right.

**Corrections are welcome and do not need to be polite about it.** Open an issue or a PR.
If you fix a page, say so in the table above: change the ⚠️ row to name yourself as the reviewer.

## The short version, in any language

MMJ is **not on npm yet**. Every package here is `private: true` and the `@mmj-map` scope
is not registered, so `pnpm add @mmj-map/elements` does nothing today.

What works right now is copying three things onto your site:

1. **Tiles** — one `.pmtiles` file you host yourself
2. **A style** — one `.json` from [`styles/`](../../styles/)
3. **The components** — plain ES modules from `packages/elements/src/`

**No tile server. No API key. No per-view billing.** Static hosting plus HTTP Range.

The base data is OpenStreetMap under ODbL: **`© OpenStreetMap contributors` stays on screen.**
