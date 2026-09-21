const KEY = "nemea:session-hint";

export function readSessionHint(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSessionHint(active: boolean): void {
  try {
    if (active) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
}
