import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, ALLOWED_USERS } from "./firebase";

function normalizeEmail(user) {
  return user?.email?.trim().toLowerCase() ?? "";
}

export function isAllowedUser(user) {
  const email = normalizeEmail(user);
  return ALLOWED_USERS.includes(email);
}

export function startAuthListener(onStateChange) {
  if (!auth) {
    onStateChange({ status: "disabled", user: null, error: "auth-not-configured" });
    return () => {};
  }

  let suppressSignedOutOnce = false;

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (suppressSignedOutOnce) {
        suppressSignedOutOnce = false;
        return;
      }
      onStateChange({ status: "signed_out", user: null, error: null });
      return;
    }

    if (!isAllowedUser(user)) {
      suppressSignedOutOnce = true;
      try {
        await signOut(auth);
      } finally {
        onStateChange({
          status: "denied",
          user: null,
          deniedEmail: normalizeEmail(user),
          error: "unauthorized"
        });
      }
      return;
    }

    onStateChange({ status: "authorized", user, error: null });
  });
}

export async function signInWithGoogle() {
  if (!auth) {
    throw new Error("auth-not-configured");
  }

  return signInWithPopup(auth, googleProvider);
}
