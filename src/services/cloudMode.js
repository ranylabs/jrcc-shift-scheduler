const LOCAL_ENABLE_KEY = 'JRCC_CLOUD_ENABLED_LOCAL';
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

let cloudAvailable = !isLocalhost || isLocalhostCloudEnabled();
let cloudDisableReason = '';
const activeListeners = new Set();

export function isCloudDisabled() {
  return !cloudAvailable;
}

export function isLocalhostMode() {
  return isLocalhost;
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
  if (isLocalhost) {
    setLocalhostCloudEnabled(false);
  }

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
  if (isLocalhost) {
    setLocalhostCloudEnabled(true);
  }
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

function isLocalhostCloudEnabled() {
  try {
    return localStorage.getItem(LOCAL_ENABLE_KEY) === '1';
  } catch {
    return false;
  }
}

function setLocalhostCloudEnabled(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(LOCAL_ENABLE_KEY, '1');
    } else {
      localStorage.removeItem(LOCAL_ENABLE_KEY);
    }
  } catch {
    // ignore
  }
}
