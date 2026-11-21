export function readStorage(area: "local" | "session", key: string): string | null {
  try {
    return (area === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(area: "local" | "session", key: string, value: string): boolean {
  try {
    (area === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(area: "local" | "session", key: string): void {
  try {
    (area === "local" ? window.localStorage : window.sessionStorage).removeItem(key);
  } catch {
    // Storage may be disabled by the browser.
  }
}
