type UnreadCounts = Record<string, number>;

export type UnreadScope = "employee" | "employer";

type StorageBundle = {
  dm: string;
  group: string;
  flag: string;
  unreadDm: string;
  unreadGroup: string;
};

const STORAGE_KEYS: Record<UnreadScope, StorageBundle> = {
  employee: {
    dm: "scheduleit:employee:dm-read-counts",
    group: "scheduleit:employee:group-read-counts",
    flag: "scheduleit:employee:messages-has-unread",
    unreadDm: "scheduleit:employee:dm-unread-counts",
    unreadGroup: "scheduleit:employee:group-unread-counts",
  },
  employer: {
    dm: "scheduleit:employer:dm-read-counts",
    group: "scheduleit:employer:group-read-counts",
    flag: "scheduleit:employer:messages-has-unread",
    unreadDm: "scheduleit:employer:dm-unread-counts",
    unreadGroup: "scheduleit:employer:group-unread-counts",
  },
};

const UNREAD_EVENT = "scheduleit:messages-unread-change";

function safeParseRecord(raw: string | null): UnreadCounts {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function safeGetItem(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getUnreadCountsKey(scope: UnreadScope, type: "dm" | "group") {
  return type === "dm"
    ? STORAGE_KEYS[scope].unreadDm
    : STORAGE_KEYS[scope].unreadGroup;
}

function dispatchUnreadCountsEvent(
  scope: UnreadScope,
  type: "dm" | "group",
  counts: UnreadCounts,
) {
  window.dispatchEvent(
    new CustomEvent(`${UNREAD_EVENT}:${type}-counts`, {
      detail: { scope, counts },
    }),
  );
}

export function loadReadCounts(scope: UnreadScope, type: "dm" | "group") {
  if (typeof window === "undefined") return {};
  return safeParseRecord(safeGetItem(STORAGE_KEYS[scope][type]));
}

export function saveReadCounts(
  scope: UnreadScope,
  type: "dm" | "group",
  counts: UnreadCounts,
) {
  if (typeof window === "undefined") return;
  safeSetItem(STORAGE_KEYS[scope][type], JSON.stringify(counts));
  window.dispatchEvent(
    new CustomEvent(`${UNREAD_EVENT}:reads`, { detail: { scope } }),
  );
}

export function loadUnreadCounts(scope: UnreadScope, type: "dm" | "group") {
  if (typeof window === "undefined") return {};
  return safeParseRecord(safeGetItem(getUnreadCountsKey(scope, type)));
}

export function saveUnreadCounts(
  scope: UnreadScope,
  type: "dm" | "group",
  counts: UnreadCounts,
) {
  if (typeof window === "undefined") return;
  safeSetItem(getUnreadCountsKey(scope, type), JSON.stringify(counts));
  dispatchUnreadCountsEvent(scope, type, counts);
}

function updateUnreadCounts(
  scope: UnreadScope,
  type: "dm" | "group",
  updater: (prev: UnreadCounts) => UnreadCounts,
) {
  if (typeof window === "undefined") return;
  const next = updater(loadUnreadCounts(scope, type));
  saveUnreadCounts(scope, type, next);
}

export function incrementUnreadCount(
  scope: UnreadScope,
  type: "dm" | "group",
  id: string | null | undefined,
  delta = 1,
) {
  if (!id || delta <= 0) return;
  updateUnreadCounts(scope, type, (prev) => ({
    ...prev,
    [id]: (prev[id] ?? 0) + delta,
  }));
}

export function clearUnreadCount(
  scope: UnreadScope,
  type: "dm" | "group",
  id: string | null | undefined,
) {
  if (!id) return;
  updateUnreadCounts(scope, type, (prev) => {
    if (!prev[id]) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

export function loadUnreadFlag(scope: UnreadScope) {
  if (typeof window === "undefined") return false;
  return safeGetItem(STORAGE_KEYS[scope].flag) === "1";
}

export function saveUnreadFlag(scope: UnreadScope, hasUnread: boolean) {
  if (typeof window === "undefined") return;
  const key = STORAGE_KEYS[scope].flag;
  const next = hasUnread ? "1" : "0";
  const prev = safeGetItem(key);
  if (prev !== next) {
    safeSetItem(key, next);
  }
  window.dispatchEvent(
    new CustomEvent(UNREAD_EVENT, { detail: { scope, hasUnread } }),
  );
}

export function subscribeToUnreadFlag(
  scope: UnreadScope,
  setValue: (hasUnread: boolean) => void,
) {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event: Event) => {
    const custom = event as CustomEvent<{ scope: UnreadScope; hasUnread: boolean }>;
    if (custom.detail?.scope === scope) {
      setValue(Boolean(custom.detail.hasUnread));
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS[scope].flag && event.newValue) {
      setValue(event.newValue === "1");
    }
  };

  window.addEventListener(UNREAD_EVENT, handleEvent as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(UNREAD_EVENT, handleEvent as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function subscribeToReadCountChanges(
  scope: UnreadScope,
  handler: () => void,
) {
  if (typeof window === "undefined") return () => {};
  const eventName = `${UNREAD_EVENT}:reads`;
  const listener = () => handler();
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

export function clearUnreadFlag(scope: UnreadScope) {
  saveUnreadFlag(scope, false);
}

export function getStorageKeys(scope: UnreadScope) {
  return STORAGE_KEYS[scope];
}

export { UNREAD_EVENT };
