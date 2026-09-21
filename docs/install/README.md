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

**The components are on npm. Everything else you host yourself.**

```bash
pnpm add @mmj-map/elements
```

A map needs three things, and that command gives you one of them:

1. **Tiles** — one `.pmtiles` file **you host yourself**
2. **A style** — one `.json` from [`styles/`](../../styles/), **copied next to your page**
3. **The components** — `@mmj-map/elements` from npm, or the plain ES modules copied by hand

**There is no hosted tile endpoint and no hosted style.** That is deliberate, not missing.

**No tile server. No API key. No per-view billing.** Static hosting plus HTTP Range.

The base data is OpenStreetMap under ODbL: **`© OpenStreetMap contributors` stays on screen.**
