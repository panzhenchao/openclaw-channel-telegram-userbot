/**
 * Global PluginRuntime storage.
 *
 * openclaw passes a runtime object during plugin registration.
 * We store it here so all modules can access it without prop-drilling.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _runtime: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setTelegramRuntime(rt: any): void {
  _runtime = rt;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTelegramRuntime(): any {
  if (!_runtime) {
    throw new Error(
      "Telegram Userbot runtime not initialized. Was register() called?",
    );
  }
  return _runtime;
}
