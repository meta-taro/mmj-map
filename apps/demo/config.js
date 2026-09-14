// デモが読みに行く配信元。**S1 で決まるまで null のまま。**
//
// null のあいだ、デモは地図の代わりに「まだ配信元が無い」と表示します。
// 空の地図を出すより、無いと言うほうが正確です。
window.MMJ_CONFIG = {
  // PMTiles の URL（例: https://example.com/japan.pmtiles）
  tilesUrl: null,
  // グリフの URL テンプレート（例: https://example.com/glyphs/{fontstack}/{range}.pbf）
  glyphsUrl: null,
  // スタイル JSON の URL（同一オリジンの相対パスでよい）
  styleUrl: null,
};
