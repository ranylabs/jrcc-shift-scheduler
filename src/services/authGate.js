import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, ALLOWED_USERS } from "./firebase";

export function startAuthListener(onAllowed, onDenied) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch {
        onDenied();
      }
      return;
    }

    const email = user.email?.toLowerCase();

    if (!ALLOWED_USERS.includes(email)) {
      await signOut(auth);
      onDenied();
      return;
    }

    onAllowed(user);
  });
}
