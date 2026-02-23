import { doc, getDoc, setDoc } from 'firebase/firestore';
import { isCloudDisabled } from './cloudMode';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION = 'settings';
const DOCUMENT = 'globalTheme';

export async function loadGlobalTheme() {
  if (isCloudDisabled() || !isFirebaseConfigured || !db) {
    return null;
  }

  try {
    const snapshot = await getDoc(doc(db, COLLECTION, DOCUMENT));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data() ?? {};
    return data.theme ?? null;
  } catch {
    return null;
  }
}

export async function saveGlobalTheme(theme) {
  if (isCloudDisabled() || !isFirebaseConfigured || !db) {
    return;
  }

  try {
    await setDoc(doc(db, COLLECTION, DOCUMENT), { theme }, { merge: true });
  } catch {
    // Intentionally ignore cloud write failures.
  }
}

