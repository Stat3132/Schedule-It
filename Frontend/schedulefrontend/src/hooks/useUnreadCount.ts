"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  UNREAD_EVENT,
  loadUnreadCounts,
  getStorageKeys,
  type UnreadScope,
} from "../lib/unreadTracker";

function sumCounts(record: Record<string, number>) {
  return Object.values(record).reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

function snapshotTotal(scope: UnreadScope) {
  if (typeof window === "undefined") return 0;
  const dm = loadUnreadCounts(scope, "dm");
  const group = loadUnreadCounts(scope, "group");
  return sumCounts(dm) + sumCounts(group);
}

export function useUnreadCount(scope: UnreadScope) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      const dmEvent = `${UNREAD_EVENT}:dm-counts`;
      const groupEvent = `${UNREAD_EVENT}:group-counts`;
      const handleCounts = (event: Event) => {
        const custom = event as CustomEvent<{ scope: UnreadScope }>;
        if (custom.detail?.scope === scope) {
          onStoreChange();
        }
      };

      window.addEventListener(dmEvent, handleCounts as EventListener);
      window.addEventListener(groupEvent, handleCounts as EventListener);

      const storageKeys = getStorageKeys(scope);
      const handleStorage = (event: StorageEvent) => {
        if (!event.key) return;
        if (event.key === storageKeys.unreadDm || event.key === storageKeys.unreadGroup) {
          onStoreChange();
        }
      };

      window.addEventListener("storage", handleStorage);

      return () => {
        window.removeEventListener(dmEvent, handleCounts as EventListener);
        window.removeEventListener(groupEvent, handleCounts as EventListener);
        window.removeEventListener("storage", handleStorage);
      };
    },
    [scope],
  );

  const getSnapshot = useCallback(() => snapshotTotal(scope), [scope]);
  const getServerSnapshot = useCallback(() => 0, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
