import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

export async function loadUserTheme(uid) {
  assertFirebase();

  const snapshot = await getDoc(doc(db, 'users', uid, 'settings', 'ui'));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() ?? {};
  return data.theme ?? null;
}

export async function saveUserTheme(uid, theme) {
  assertFirebase();

  await setDoc(
    doc(db, 'users', uid, 'settings', 'ui'),
    {
      theme,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

function assertFirebase() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('פיירבייס לא מוגדר.');
  }
}
