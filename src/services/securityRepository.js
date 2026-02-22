import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { isCloudDisabled } from './cloudMode';
import { db, isFirebaseConfigured } from './firebase';

export async function loadSecurityConfig() {
  if (isCloudDisabled()) {
    return null;
  }

  assertFirebase();

  const snapshot = await getDoc(getSecurityDocRef());
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() ?? {};
  return {
    allowedEmails: normalizeEmails(data.allowedEmails)
  };
}

export async function ensureSecurityConfigDefaults(defaultEmails) {
  if (isCloudDisabled()) {
    return;
  }

  assertFirebase();

  const emails = normalizeEmails(defaultEmails);
  if (emails.length === 0) {
    return;
  }

  await setDoc(
    getSecurityDocRef(),
    {
      allowedEmails: emails,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

function normalizeEmails(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(input.map((email) => String(email ?? '').trim().toLowerCase()).filter(Boolean))];
}

function getSecurityDocRef() {
  return doc(db, 'appConfig', 'security');
}

function assertFirebase() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('פיירבייס לא מוגדר.');
  }
}
