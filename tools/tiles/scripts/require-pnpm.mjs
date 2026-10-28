// prepublishOnly から呼ぶ。pnpm 以外の publish を止める。
//
// dependencies に "@mmj-map/elements": "workspace:*" がある。pnpm publish はこれを
// 実際の版へ書き換えるが、npm publish はそのまま出す。0.1.1 / 0.1.2 は npm で出たため、
// 利用側の install が ERR_PNPM_WORKSPACE_PKG_NOT_FOUND で落ちた（Issue #4）。
const agent = process.env.npm_config_user_agent ?? "";

if (!agent.startsWith("pnpm/")) {
  console.error(
    "pnpm publish で出してください。npm publish は workspace:* を書き換えずに出します（Issue #4）。",
  );
  process.exit(1);
}
