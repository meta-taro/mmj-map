# Contributing

Issues and pull requests are welcome, in **Japanese or English**.

## Everyone is welcome here

**We do not distinguish contributors by who employs them.** There is no contributor
licence agreement, no corporate approval step, and no list of organisations whose
contributions are unwelcome.

[`PRINCIPLES.md`](PRINCIPLES.md) §2 sets conditions on **data sources** — published,
licensed in writing, reproducible. Those conditions say nothing about people. If you
work for a company whose data this project cannot use, your patch is still judged as a
patch.

## Before you open a pull request

- Read [`PRD.md`](PRD.md), in particular **§2 What we do not build**. The fastest way
  for a pull request to be declined is for it to add something that section rules out.
- Read [`.claude/decisions.md`](.claude/decisions.md). If your change contradicts a
  decision there, say so and argue against the decision — do not work around it quietly.
- **Use pnpm.** npm and yarn are not used in this repository.

## Style JSON is hand-written

Map style JSON is **not a build artifact**. Do not generate it, do not reformat it
wholesale, and do not add it to `.gitignore`. Colour choices are reviewed like code,
because the look of the map is the point of this project.

**One exception, and it is not a style question:** where the outside world already
decides a colour — rail operator line colours, traffic signals, brand colours — copy it.
Do not re-pick it to fit a palette. A recoloured rail line is a map that lies.

## Attribution is not optional

Anything you add must keep `© OpenStreetMap contributors` visible on screen. See
[`LICENSES.md`](LICENSES.md). Pull requests that hide, shrink past readability, or
remove attribution will not be merged.

## Licence of contributions

By contributing you agree that your contribution is licensed under the **MIT License**
(`LICENSE`), the same as the rest of the code in this repository.

## Please do not include personal data

This is a public repository.

- Commits must not carry personal email addresses. Set a `noreply` address before you
  commit. CI checks this (`.github/workflows/oss-privacy-check.yml`).
- Do not paste API tokens, keys, account identifiers, or internal URLs into issues,
  comments, or commit messages. **Editing them afterwards does not remove them** — edit
  history stays public.

## Reporting a problem

Open an issue with:

- what you saw, and what you expected
- the browser and version
- whether the map rendered blank (if so: check whether any glyph range returned 404 —
  a single missing range makes the whole map fail)
