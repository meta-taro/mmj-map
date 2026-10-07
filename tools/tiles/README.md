# @mmj-map/tiles

**Cut a PMTiles archive for any bounding box on earth, from public data and public tools only.**
No key, no account, no tile server.

> 日本語版は [README.ja.md](./README.ja.md) にあります（こちらが詳しい版です）。

[![A hand-styled map of Osaka, drawn from one PMTiles archive][shot-plain]][demo-plain]

<p align="center">
  <b><a href="https://meta-taro.github.io/mmj-map/">See what the output looks like</a></b> ·
  <a href="https://www.npmjs.com/package/@mmj-map/elements">render it with the components</a>
</p>

**That whole map is one file.** Cut it here, put it on static hosting, done.

```bash
npx @mmj-map/tiles extract nagoya --bbox=136.85,35.13,136.95,35.20
```

```
Cutting from the current upstream build 20260924.pmtiles (basemap 4.15.2).
Output: nagoya.20260924.pmtiles (the build date is part of the name)
...
Done: ./tiles/nagoya.20260924.pmtiles
9.8 MB — fits on GitHub Pages (100 MB per file, 1 GB per site).
Attribution (keep it on screen): © OpenStreetMap contributors
```

Put that one file on any static host and it is your map. Render it with
[`<mmj-map>`](https://www.npmjs.com/package/@mmj-map/elements), or with MapLibre directly —
this tool only produces the archive.

## Why the build date is in the filename

The upstream planet build is replaced daily, and a URL that is not pinned **stops working
the week after you ship**. The output name carries the build it came from, so you can
always say which data a given file holds.

## Commands

```bash
npx @mmj-map/tiles extract <name> --bbox=<west>,<south>,<east>,<north> [--maxzoom=15]
```

| | |
| --- | --- |
| Output | `./tiles/` where you ran it (change with `--out-dir=`) |
| Upstream | Resolved from the index at run time; pin one with `--build=<key>` |
| Max zoom | 15 by default. Lowering it (`--maxzoom=13`) makes a smaller file |

| Command | What it does |
| --- | --- |
| `resolve` | Report which upstream build is current |
| `extract` | Cut a region out of an upstream build |
| `check-range` | Check that a host serves HTTP Range correctly |
| `check-age` | Report how old a published archive is |

### `check-range` is worth running before you ship

PMTiles works by asking for byte ranges. A host that answers `200` with the whole file
instead of `206` with a slice still *looks* fine — the map draws — but **every tile pulls
the entire archive**. You will not notice from the screen; you will notice from the bill
or from a user on mobile data.

Hosts that answer `206`: GitHub Pages, Cloudflare R2, Amazon S3, Netlify.

### Sizes, measured

| Area | Size |
| --- | --- |
| Nagoya (city, z15) | 9.8 MB |
| Hanoi | 10.9 MB |
| Osaka (demo: wide z9 plus city z15) | 62.8 MB |
| All of Japan (z15) | 2.6 GB |

**Most uses do not need the whole world.** Your own city is usually the whole job.

## What this does not do

- **It does not build tiles.** It cuts from [Protomaps](https://protomaps.com/)' daily
  planet build using [go-pmtiles](https://github.com/protomaps/go-pmtiles). There is no
  pipeline to maintain here.
- **It does not host anything.** Where the file goes is your decision.
- **It does not carry styles.** Those live in
  [MMJ](https://github.com/meta-taro/mmj-map) as hand-written JSON.

## Attribution

The data is OpenStreetMap under ODbL. Whatever you render it with, keep
`© OpenStreetMap contributors` visible. See
[LICENSES.md](https://github.com/meta-taro/mmj-map/blob/develop/LICENSES.md).

## License

MIT for the code. Map data is OpenStreetMap, ODbL.

<!--
  Images and demo links are defined here, in one place. Absolute URLs on purpose:
  npm resolves relative paths against nothing useful, and a relative image dies
  on the package page. Look at any screenshot before adding it.
-->

[shot-plain]: https://raw.githubusercontent.com/meta-taro/mmj-map/develop/apps/demo/shots/plain.jpg

[demo-plain]: https://meta-taro.github.io/mmj-map/plain.html
