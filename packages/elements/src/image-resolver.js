/**
 * 地図ごとの「足りない絵を作る受け口」。`<mmj-poi>` の写真ピンと、
 * `<mmj-cluster>` のまち針・輪が**同じ 1 本を分け合う**。
 *
 * **`setMissingStyleImageResolver` は地図に 1 本しか置けない。**
 * 部品ごとに置くと後から置いたほうが勝ち、**先の部品の絵が出なくなる**。
 * 束ねたものを 1 本だけ置いて、各要素はこの配列へ入る。
 * @type {WeakMap<any, ((id: unknown) => Promise<boolean>)[]>}
 */
const resolvers = new WeakMap();

/**
 * 受け口を足す。**外す手を返す。**
 *
 * **新しい API（`setMissingStyleImageResolver`）があればそちらを使う。**
 * MapLibre が結果を待ってくれるので、**「画像がありません」の警告が出ない**
 * （`styleimagemissing` だと、作り終わる前に 1 件ずつ警告が出る——実測で
 * `shops.html` に 3 件出た）。古い版では従来の催促で動かす。
 *
 * @param {any} map
 * @param {(id: unknown) => Promise<boolean>} handler 引き受けたら `true`
 * @returns {() => void}
 */
export function addImageResolver(map, handler) {
  if (typeof map.setMissingStyleImageResolver !== "function") {
    const listener = (/** @type {any} */ event) => void handler(event.id);
    map.on("styleimagemissing", listener);
    return () => map.off("styleimagemissing", listener);
  }

  let list = resolvers.get(map);
  if (list === undefined) {
    list = [];
    resolvers.set(map, list);
    map.setMissingStyleImageResolver(async (/** @type {unknown} */ id) => {
      // **引き受けたものが出たら、そこで止める**（同じ id を 2 回作らない）
      for (const fn of list ?? []) if (await fn(id)) return;
    });
  }
  list.push(handler);

  return () => {
    const at = list?.indexOf(handler) ?? -1;
    if (at >= 0) list?.splice(at, 1);
  };
}
