#!/usr/bin/env bash
# OSS 公開リポの個人情報混入チェック（product-baseline §32）
#
# 使い方:
#   .github/scripts/oss-privacy-check.sh <BASE> <HEAD>   # 範囲の commit + 差分を検査
#   .github/scripts/oss-privacy-check.sh                 # 未 commit の作業ツリー差分のみ検査
#
# 環境変数（すべて任意）:
#   OSS_ALLOWED_AUTHOR_EMAIL_REGEX  commit author/committer に許可するメールの ERE
#                                   既定: @users\.noreply\.github\.com$
#   OSS_ALLOWED_EMAIL_DOMAINS       追加行・commit message で許可するメールドメイン（空白区切り）
#   OSS_ALLOWED_EMAILS              同上を、ドメインではなくアドレス完全一致で許可（空白区切り）
#   OSS_DENY_WORDS                  禁止語（実名等）を 1 行 1 語。CI では secrets から渡す
#
# 設計上の約束:
#   - 検出しても「見つかった中身」をログへ出さない。CI ログは公開されるため、
#     そこへ実名やメールをそのまま印字すると検査自体が漏洩経路になる。
#     出力は「場所（file:line / commit）＋ 規則 ID ＋ マスク済み文字列」に限る。
set -uo pipefail

ALLOWED_AUTHOR_RE="${OSS_ALLOWED_AUTHOR_EMAIL_REGEX:-@users\.noreply\.github\.com$}"
ALLOWED_DOMAINS="${OSS_ALLOWED_EMAIL_DOMAINS:-example.com example.org example.net users.noreply.github.com}"
# 完全一致で許可するアドレス。commit message の Co-Authored-By トレーラに入る
# 生成ツールの no-reply がここに該当する。ドメインごと許可すると、その組織の
# 実在の個人アドレスまで通ってしまうため、値で許す。
ALLOWED_EMAILS="${OSS_ALLOWED_EMAILS:-noreply@anthropic.com}"
DENY_WORDS="${OSS_DENY_WORDS:-}"

EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# 検査スクリプト自身は正規表現やドメイン例を含むため除外する
SELF_RE='^\.github/(scripts/oss-privacy-check\.sh|workflows/oss-privacy-check\.yml)$'

fail=0
note() { printf '%s\n' "$*" >&2; }

# メールを y***@***.com 形式へ落とす（公開ログへ原文を出さないため）
mask_email() {
  sed -E 's/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.([A-Za-z]{2,})/\1***@***.\2/g'
}

lower() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

allowed_email() {
  local e d
  e="$(lower "$1")"
  for a in $ALLOWED_EMAILS; do
    [ "$e" = "$(lower "$a")" ] && return 0
  done
  d="${e##*@}"
  for a in $ALLOWED_DOMAINS; do
    [ "$d" = "$(lower "$a")" ] && return 0
  done
  return 1
}

# --- 範囲の解決 -------------------------------------------------------------
BASE="${1:-}"
HEAD_REF="${2:-HEAD}"
RANGE=""
resolve_base() {
  # 指定された base が使えるならそれを使う
  if [ -n "$BASE" ] && ! printf '%s' "$BASE" | grep -Eq '^0{7,40}$'; then
    if git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
      printf '%s' "$BASE"
      return 0
    fi
  fi
  # 新規ブランチの push（base が全ゼロ）等では既定ブランチとの merge-base へフォールバックする。
  # ここを諦めると「ブランチを新規に切った初回 push」が commit 検査を素通りしてしまう。
  for r in origin/HEAD origin/main origin/master origin/develop main master develop; do
    if git rev-parse --verify --quiet "$r^{commit}" >/dev/null; then
      mb="$(git merge-base "$r" "$HEAD_REF" 2>/dev/null)" || continue
      [ -n "$mb" ] && { printf '%s' "$mb"; return 0; }
    fi
  done
  return 1
}

if BASE_RESOLVED="$(resolve_base)"; then
  if [ "$BASE_RESOLVED" != "${BASE:-}" ]; then
    note "INFO base '${BASE:-未指定}' を解決できないため ${BASE_RESOLVED:0:8}（既定ブランチとの merge-base）へフォールバックしました"
  fi
  BASE="$BASE_RESOLVED"
  RANGE="$BASE..$HEAD_REF"
else
  note "INFO base を解決できないため commit 検査をスキップし、作業ツリー差分のみ検査します"
fi

if [ -z "$DENY_WORDS" ]; then
  note "INFO OSS_DENY_WORDS が空のため禁止語検査はスキップします（fork からの PR では GitHub 仕様上 secrets が渡らず常に空になります）"
fi

# --- 1. commit の author / committer（メール + 表示名） ---------------------
if [ -n "$RANGE" ]; then
  while IFS='|' read -r sha ae ce an cn; do
    [ -z "${sha:-}" ] && continue
    for e in "$ae" "$ce"; do
      if ! printf '%s' "$e" | grep -Eq "$ALLOWED_AUTHOR_RE"; then
        note "NG [author-email] ${sha:0:8} : $(printf '%s' "$e" | mask_email) が許可パターン外"
        fail=1
      fi
    done
    # 表示名（user.name）は実名がそのまま入りやすく、かつメール検査では拾えない
    if [ -n "$DENY_WORDS" ]; then
      for n in "$an" "$cn"; do
        i=0
        while IFS= read -r w; do
          i=$((i + 1))
          [ -z "$w" ] && continue
          if printf '%s' "$n" | grep -qiF -- "$w"; then
            note "NG [author-name] ${sha:0:8} : 表示名が禁止語 #$i に一致"
            fail=1
          fi
        done <<< "$DENY_WORDS"
      done
    fi
  done < <(git log --format='%H|%ae|%ce|%an|%cn' "$RANGE")
fi

# --- 2. commit message ------------------------------------------------------
if [ -n "$RANGE" ]; then
  while read -r sha; do
    [ -z "${sha:-}" ] && continue
    msg="$(git log -1 --format='%B' "$sha")"
    while read -r found; do
      [ -z "${found:-}" ] && continue
      allowed_email "$found" && continue
      note "NG [message-email] ${sha:0:8} : $(printf '%s' "$found" | mask_email)"
      fail=1
    done < <(printf '%s' "$msg" | grep -Eo "$EMAIL_RE" | sort -u)

    if [ -n "$DENY_WORDS" ]; then
      i=0
      while IFS= read -r w; do
        i=$((i + 1))
        [ -z "$w" ] && continue
        if printf '%s' "$msg" | grep -qiF -- "$w"; then
          note "NG [message-denyword] ${sha:0:8} : 禁止語 #$i に一致"
          fail=1
        fi
      done <<< "$DENY_WORDS"
    fi
  done < <(git log --format='%H' "$RANGE")
fi

# --- 3. 追加行（差分） ------------------------------------------------------
# commit 済みの範囲差分と、未 commit（staged + unstaged）の差分を両方見る。
# CI では後者が空になり、ローカルの commit 前チェックでは前者が空になる。
diff_out=""
if [ -n "$RANGE" ]; then
  diff_out="$(git diff --unified=0 "$BASE" "$HEAD_REF")"
fi
diff_out="$diff_out
$(git diff --unified=0 HEAD)"

# 未追跡ファイルは `git diff` に出ない。**新規ファイルへ書いた連絡先が素通りする**ため、
# 追加行として同じ検査へ流す。`--no-index` は差分があると 1 で終わるので握る
# （握り潰しではなく、これは「差分あり」の合図・§8）。
while IFS= read -r untracked; do
  [ -z "$untracked" ] && continue
  diff_out="$diff_out
$(git diff --no-index --unified=0 -- /dev/null "$untracked" 2>/dev/null || true)"
done < <(git ls-files --others --exclude-standard)

# 走査は awk の **1 パス**で終わらせ、bash 側は「見つかったもの」だけを回す。
#
# 以前は追加行 1 行ごとに grep を 1〜2 個起動していた。4242 行の差分で 2 時間以上
# 返らず、**commit 前のゲートとして使えなかった**（Linux の CI では 7 秒で終わるため
# 気づきにくい。遅いのは手元＝人が待つ側だけ、という壊れ方をしていた）。
#
# awk の正規表現は POSIX ERE。`{2,}` は mawk 等で解釈が割れるため、
# ここでは `[A-Za-z][A-Za-z]+`（＝2 文字以上）と書き下す。
#
# **バックスラッシュは 2 本書く。** `awk -v` は値のエスケープを展開するため、
# `\.` と書くと awk へ渡る時点で `.`（任意の 1 文字）に潰れる。そうなると
# `maplibre-gl@5.24.0/dist` や `mocker@5.0.0(vite` をメールとして拾い、
# **誤検出だらけで検査が信用されなくなる**（実際にそうなった）。
AWK_EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z][A-Za-z]+'

# 同じ理由で、既存のパターンを awk へ渡すときもバックスラッシュを増やす。
# SELF_RE をそのまま渡すと `\.` が `.` に潰れ、除外パターンが緩くなるうえ
# 実行のたびに awk の警告が出る（**警告で出力が汚れると、本物の NG が埋もれる**）。
AWK_SELF_RE="${SELF_RE//\\/\\\\}"

hits="$(printf '%s\n' "$diff_out" | awk \
  -v self_re="$AWK_SELF_RE" -v email_re="$AWK_EMAIL_RE" -v deny="$DENY_WORDS" '
  BEGIN {
    dn = split(deny, dw, "\n")
    for (i = 1; i <= dn; i++) dwl[i] = tolower(dw[i])
  }
  /^\+\+\+ / { f = substr($0, 7); next }
  /^@@ /     { split($0, a, " "); split(substr(a[3], 2), b, ","); ln = b[1]; next }
  /^\+/ {
    line = substr($0, 2)
    if (f !~ self_re) {
      rest = line
      while (match(rest, email_re)) {
        print "E\t" f "\t" ln "\t" substr(rest, RSTART, RLENGTH)
        rest = substr(rest, RSTART + RLENGTH)
      }
      if (dn > 0) {
        low = tolower(line)
        for (i = 1; i <= dn; i++)
          if (dwl[i] != "" && index(low, dwl[i]) > 0) print "D\t" f "\t" ln "\t" i
      }
    }
    ln++
    next
  }
')"

# 通常ここは空。空でない＝混入が見つかったときだけ、行ごとの処理が走る
if [ -n "$hits" ]; then
  while IFS=$'\t' read -r kind file lineno value; do
    [ -z "${kind:-}" ] && continue
    if [ "$kind" = "E" ]; then
      allowed_email "$value" && continue
      note "NG [added-email] $file:$lineno : $(printf '%s' "$value" | mask_email)"
      fail=1
    else
      note "NG [added-denyword] $file:$lineno : 禁止語 #$value に一致"
      fail=1
    fi
  done <<< "$hits"
fi

# --- 結果 -------------------------------------------------------------------
if [ "$fail" -ne 0 ]; then
  note ""
  note "個人情報の混入が疑われます（product-baseline §32）。"
  note "  - 追加行が原因: 当該行を修正して commit し直す"
  note "  - commit author/message が原因: history に焼き付くため rebase での書き換えが要る。"
  note "    公開後に気づいた場合は force push の可否を含めてリポジトリのオーナーへ Issue で確認する"
  exit 1
fi

note "OK 個人情報の混入は検出されませんでした"
