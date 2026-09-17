/**
 * Worker が使う範囲だけの R2 の形。
 *
 * **@cloudflare/workers-types を入れていない。**使うのは head / get の 2 つだけで、
 * 型のためだけに依存を 1 つ増やす理由が無い（ベースルール §12）。
 * 本物の R2Bucket はこの形を満たす。
 */
export interface R2Range {
  readonly offset: number;
  readonly length: number;
}

export interface R2ObjectMeta {
  readonly size: number;
  readonly httpEtag: string;
}

export interface R2ObjectBody extends R2ObjectMeta {
  readonly body: ReadableStream;
}

export interface R2BucketLike {
  head(key: string): Promise<R2ObjectMeta | null>;
  get(key: string, options?: { range?: R2Range }): Promise<R2ObjectBody | null>;
}

export interface Env {
  /** wrangler.toml の r2_buckets binding */
  readonly TILES: R2BucketLike;
  /**
   * 読ませるオリジン。カンマ区切りで複数書ける。`*` で誰にでも開く。
   *
   * **未設定なら閉じます。**設定を忘れたデプロイが、そのまま誰でも使える CDN に
   * ならないようにするためです。守っているのはデータではなく（ODbL なので隠す対象では
   * ない）、**こちらの転送量**です。
   *
   * **これはブラウザにしか効きません。**サーバー経由の取得は止まりません。
   * 止めたいなら、そもそも Range で配らず**地域ごとのファイルを渡す**ほうが確実です
   * （原案 §8.2）。
   */
  readonly ALLOW_ORIGINS?: string;
}
