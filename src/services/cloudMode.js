let cloudAvailable = true;
let cloudDisableReason = '';
const activeListeners = new Set();

export function isCloudDisabled() {
  return !cloudAvailable;
}

export function disableCloud(reason) {
  if (!cloudAvailable) {
    if (reason) {
      cloudDisableReason = reason;
    }
    return;
  }

  cloudAvailable = false;
  cloudDisableReason = reason || 'cloud unavailable';

  for (const unsubscribe of Array.from(activeListeners)) {
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  }
  activeListeners.clear();
}

export function enableCloud() {
  cloudAvailable = true;
  cloudDisableReason = '';
}

export function getCloudDisableReason() {
  return cloudDisableReason;
}

export function trackCloudListener(unsubscribe) {
  if (typeof unsubscribe !== 'function') {
    return () => {};
  }

  if (!cloudAvailable) {
    try {
      unsubscribe();
    } catch {
      // ignore
    }
    return () => {};
  }

  activeListeners.add(unsubscribe);

  return () => {
    activeListeners.delete(unsubscribe);
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  };
}
