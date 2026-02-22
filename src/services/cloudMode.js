const STORAGE_KEY = 'JRCC_CLOUD_DISABLED';

export function isCloudDisabled() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function disableCloud(reason) {
  try {
    localStorage.setItem(STORAGE_KEY, reason || 'disabled');
  } catch {
    // ignore storage errors
  }
}

export function enableCloud() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getCloudDisableReason() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}
