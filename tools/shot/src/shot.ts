/**
 * キャプチャの判断だけを持つ。**ブラウザもファイルも触らない。**
 *
 * なぜこの道具があるか: **手元の画面を見られない人へ、実物を渡すため**。
 * リモートから開発している人は `http://localhost:8787/` を開けない。
 * 「テストが通った」では地図が読めるかどうかは分からない（ベースルール §29）。
 *
 * **これは人が見ることの代わりにならない。**撮れた絵を判断するのは人。
 */

export interface ShotArgs {
  readonly url: string;
  readonly out: string;
  readonly waitMs: number;
}

const DEFAULTS: ShotArgs = { url: "http://localhost:8787/", out: "shot.png", waitMs: 25000 };

export function parseShotArgs(argv: readonly string[]): ShotArgs {
  // pnpm は `--` をそのまま実引数として渡してくる
  const args = argv.filter((arg) => arg !== "--");
  const [url, out, wait] = args;

  if (wait !== undefined && !/^\d+$/.test(wait)) {
    // 黙って既定へ戻さない。待っていないことに気づけなくなる
    throw new Error(`待ち時間はミリ秒の数で指定してください: ${wait}`);
  }

  return {
    url: url ?? DEFAULTS.url,
    out: out ?? DEFAULTS.out,
    waitMs: wait === undefined ? DEFAULTS.waitMs : Number(wait),
  };
}

export interface WaitState {
  /** 通信が途切れた時刻。まだ途切れていなければ null */
  readonly quietSince: number | null;
}

/**
 * いつ撮るかを決める。**固定時間で待たない。**
 * タイルは Range で細切れに来るため、「読み込みが止まってから一定時間」を待つ。
 * 早すぎると空の地図を撮り、それを「地図が出ない」と誤読する。
 */
export function nextWaitState(
  state: WaitState,
  inflight: number,
  now: number,
  quietMs: number,
): { state: WaitState; done: boolean } {
  if (inflight > 0) return { state: { quietSince: null }, done: false };
  const quietSince = state.quietSince ?? now;
  return { state: { quietSince }, done: now - quietSince > quietMs };
}

export function pickBrowser(candidates: readonly string[], exists: (path: string) => boolean): string {
  const found = candidates.find(exists);
  if (found === undefined) {
    throw new Error(`ブラウザが見つかりません。探した場所:\n  ${candidates.join("\n  ")}`);
  }
  return found;
}

/**
 * 「読み込みが止まったか」を数える対象かどうか。
 *
 * MapLibre の worker は `blob:` で読み込まれ、**ページが生きているあいだずっと開いたまま**に
 * なる（実測）。これを数えると静かになる瞬間が永久に来ず、毎回待ち切ってから撮ることになる。
 * 見たいのは配信への要求（タイル・スタイル・グリフ）だけ。
 */
export const isCountableRequest = (url: string): boolean => /^https?:/i.test(url);

/**
 * 案内画面（配信元が無いときの代替表示）が出たまま撮れたかどうか。
 *
 * ブラウザ側は 3 つの状態を返す。**「案内画面を持たないページ」を
 * 「案内画面が出ている」と混同しない**ための区別。
 *
 * - `true`  … 案内画面がある、かつ出ている → 地図ではない。成功にしない
 * - `false` … 案内画面があるが隠れている → 地図が出ている
 * - `null`  … そのページに案内画面が無い → 判定の対象外
 *
 * 以前は `!document.getElementById('notice')?.hidden` と書いていた。
 * 要素が無いと `!undefined` で **true** になるため、デモ以外のページを撮ると
 * 毎回 exit 1 になった（実測: 3D の検証用ページで、地図が撮れているのに失敗扱い）。
 */
export function isNoticeShown(probeJson: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(probeJson);
  } catch {
    throw new Error(`画面の状態を読めません: ${probeJson.slice(0, 200)}`);
  }
  if (typeof parsed !== "object" || parsed === null || !("notice" in parsed)) {
    throw new Error(`画面の状態に notice がありません: ${probeJson.slice(0, 200)}`);
  }
  return (parsed as { notice: unknown }).notice === true;
}
