"use client";

import { useCallback, useSyncExternalStore } from "react";
import { loadUnreadFlag, subscribeToUnreadFlag, type UnreadScope } from "../lib/unreadTracker";

export function useUnreadFlag(scope: UnreadScope) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") {
        return () => {};
      }
      return subscribeToUnreadFlag(scope, () => {
        onStoreChange();
      });
    },
    [scope],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return loadUnreadFlag(scope);
  }, [scope]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
