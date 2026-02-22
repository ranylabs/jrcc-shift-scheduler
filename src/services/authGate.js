import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { ALLOWED_USERS, auth, googleProvider } from './firebase';
import { isCloudDisabled } from './cloudMode';
import { ensureSecurityConfigDefaults, loadSecurityConfig } from './securityRepository';

function normalizeEmail(user) {
  return user?.email?.trim().toLowerCase() ?? '';
}

export function startAuthListener(onStateChange) {
  if (!auth) {
    onStateChange({ status: 'disabled', user: null, error: 'auth-not-configured' });
    return () => {};
  }

  let signedOutByGuard = false;

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (signedOutByGuard) {
        signedOutByGuard = false;
        return;
      }
      onStateChange({ status: 'signed_out', user: null, error: null });
      return;
    }

    const email = normalizeEmail(user);

    if (isCloudDisabled()) {
      if (ALLOWED_USERS.includes(email)) {
        onStateChange({ status: 'authorized', user, error: null });
        return;
      }

      signedOutByGuard = true;
      try {
        await signOut(auth);
      } finally {
        onStateChange({
          status: 'denied',
          user: null,
          deniedEmail: email,
          error: 'unauthorized'
        });
      }
      return;
    }

    try {
      let security = await loadSecurityConfig();
      let allowedEmails = security?.allowedEmails ?? [];

      if (allowedEmails.length === 0 && ALLOWED_USERS.includes(email)) {
        await ensureSecurityConfigDefaults(ALLOWED_USERS);
        security = await loadSecurityConfig();
        allowedEmails = security?.allowedEmails ?? [];
      }

      if (!allowedEmails.includes(email)) {
        signedOutByGuard = true;
        try {
          await signOut(auth);
        } finally {
          onStateChange({
            status: 'denied',
            user: null,
            deniedEmail: email,
            error: 'unauthorized'
          });
        }
        return;
      }

      onStateChange({ status: 'authorized', user, error: null });
    } catch {
      signedOutByGuard = true;
      try {
        await signOut(auth);
      } finally {
        onStateChange({
          status: 'denied',
          user: null,
          deniedEmail: email,
          error: 'security-config-unavailable'
        });
      }
    }
  });
}

export async function signInWithGoogle() {
  if (!auth) {
    throw new Error('auth-not-configured');
  }

  return signInWithPopup(auth, googleProvider);
}

export async function signOutCurrentUser() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}
