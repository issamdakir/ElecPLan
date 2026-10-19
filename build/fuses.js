// afterPack hook: disable ELECTRON_RUN_AS_NODE so the app still opens when launched
// from a shell that has it set (e.g. VS Code's integrated terminal).
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'linux') return;
  const exe = path.join(context.appOutDir, context.packager.executableName);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
  });
};
