#!/usr/bin/env bash
# 公開中の LP の帯（「開発中の版です。npm は X です」）が、いまの npm と合っているかを判定する。
#
#   lp-banner-stale.sh <LP の HTML ファイル> <npm の版> <リポの版>
#
# 標準出力に 1 語だけ出す:
#   stale  帯が古い（デモを出し直せば直る）
#   fresh  合っている（何もしない）
# 判定できないとき（HTML が LP でない・空）は終了コード 2。**黙って fresh にしない。**
#
# ## なぜ要るか
#
# 帯は deploy のときに焼き込まれる。npm へ出たのが deploy の**後**だと、
# 帯は古いまま残る。2026-11-16、0.9.0 を手で npm へ出したあと
# 「npm で配っているのは 0.8.0」が 3 日残り、利用者が見つけた。
# 手で出したときは GitHub に何の合図も来ないので、**後から見比べるしかない。**
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "使い方: $0 <LP の HTML> <npm の版> <リポの版>" >&2
  exit 2
fi

html_file="$1"
npm_version="$2"
pkg_version="$3"

if [ -z "$npm_version" ] || [ -z "$pkg_version" ]; then
  echo "版が空です（npm: '$npm_version' / リポ: '$pkg_version'）" >&2
  exit 2
fi

# **エラー頁や空を測って「帯なし＝合っている」と言わない。**LP の目印を先に見る
if ! grep -q '<body class="lp">' "$html_file"; then
  echo "$html_file は LP ではありません（<body class=\"lp\"> が無い）。判定しません" >&2
  exit 2
fi

banner="$(grep -o '<p class="lp-unreleased".*</p>' "$html_file" || true)"
should_show=false
[ "$pkg_version" != "$npm_version" ] && should_show=true

if [ -z "$banner" ]; then
  # 帯なし。出ているべきなら古い
  if [ "$should_show" = true ]; then echo stale; else echo fresh; fi
  exit 0
fi

# 帯あり。もう要らないなら古い
if [ "$should_show" = false ]; then
  echo stale
  exit 0
fi

# 帯あり・要る。中の数字が今と合っているか
shown_dev="$(printf '%s' "$banner" | sed -n 's/.*開発中の版（\([^）]*\)）.*/\1/p')"
shown_npm="$(printf '%s' "$banner" | sed -n 's/.*<code>\([^<]*\)<\/code>.*/\1/p')"
if [ "$shown_dev" != "$pkg_version" ] || [ "$shown_npm" != "$npm_version" ]; then
  echo stale
else
  echo fresh
fi
