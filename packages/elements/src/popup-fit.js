/**
 * 開いた吹き出しを、地図の見えている所に収める（DOM 側）。
 *
 * MapLibre は**開いた瞬間の大きさ**で吹き出しの向き（上・下・横）を決める。
 * 写真はあとから読み込まれて箱が伸びるので、伸びたぶんが地図の縁で切れる。
 * ここは「向きを選び直す」と「はみ出したぶん地図を送る」の 2 つだけをする。
 *
 * `<mmj-route>` の案内と `<mmj-route-editor>` の入力欄が使う。
 */

/** 欄の縁と地図の縁のあいだに空ける幅（px） */
const EDGE_GAP = 8;

/**
 * 吹き出しの向きを今の大きさで選び直し、まだ地図の外へはみ出すなら、はみ出したぶんだけ地図を送る。
 * **地図が低い管理画面では、上にも下にも入りきらない**（欄は写真込みで 300px ほど）。
 * 入りきらないまま開くと、下の「この案内を消す」が地図の縁で切れて押せなかった（2026-11-25）。
 * @param {any} map @param {any} popup
 */
export function keepPopupInside(map, popup) {
  const element = popup.getElement();
  if (!element) return;
  // 同じ位置へ置き直すと、MapLibre が今の大きさで向きを選び直す
  popup.setLngLat(popup.getLngLat());
  const box = element.getBoundingClientRect();
  const container = map.getContainer();
  const frame = container.getBoundingClientRect();
  // **上の隅の部品（操作の帯・拡大縮小）の下も、見えない場所として扱う。**
  // 部品は吹き出しより手前に出るので、重なると欄が帯の裏に隠れた（携帯の幅・2026-11-25）
  // 下の隅（帰属表示・縮尺）も同じ。狭い画面では帰属表示が幅いっぱいになり、「この案内を消す」に被った
  const overlapping = (/** @type {string} */ selector) =>
    [...container.querySelectorAll(selector)]
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.left < box.right && rect.right > box.left);
  const top = overlapping(".maplibregl-ctrl-top-left > *, .maplibregl-ctrl-top-right > *");
  const bottom = overlapping(".maplibregl-ctrl-bottom-left > *, .maplibregl-ctrl-bottom-right > *");
  const ceiling = Math.max(frame.top, ...top.map((rect) => rect.bottom));
  const floor = Math.min(frame.bottom, ...bottom.map((rect) => rect.top));
  const below = box.bottom - (floor - EDGE_GAP);
  const above = ceiling + EDGE_GAP - box.top;
  // 上と下の両方からはみ出すほど低いなら、上を合わせる（吹き出しの頭——案内の文や入力欄——を先に見せる）
  const dy = above > 0 ? -above : Math.max(0, below);
  if (dy !== 0) map.panBy([0, dy], { duration: 0 });
}
