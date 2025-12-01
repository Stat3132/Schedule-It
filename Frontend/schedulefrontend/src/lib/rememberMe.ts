type RememberScope = "employer" | "employee";

const STORAGE_KEYS: Record<RememberScope, string> = {
  employer: "scheduleit_remember_employer",
  employee: "scheduleit_remember_employee",
};

function safeParse(value: string | null): { email: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { email?: unknown };
    if (parsed && typeof parsed.email === "string") {
      return { email: parsed.email };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function loadRememberedEmail(scope: RememberScope) {
  if (typeof window === "undefined") return null;
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEYS[scope]));
  } catch {
    return null;
  }
}

export function saveRememberedEmail(scope: RememberScope, email: string) {
  if (typeof window === "undefined") return;
  if (!email.trim()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEYS[scope],
      JSON.stringify({ email: email.trim() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearRememberedEmail(scope: RememberScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS[scope]);
  } catch {
    /* ignore */
  }
}
