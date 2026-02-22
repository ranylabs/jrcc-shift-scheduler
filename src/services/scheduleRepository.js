import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION = 'schedules';

export async function saveScheduleByMonth(monthKey, payload) {
  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);
  await setDoc(
    ref,
    {
      monthKey,
      ...payload,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function loadScheduleByMonth(monthKey) {
  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    monthKey,
    schedule: data.schedule ?? {},
    scheduleMeta: data.scheduleMeta ?? {}
  };
}

function assertFirebase() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('פיירבייס לא מוגדר. יש למלא משתני VITE_FIREBASE בסביבת העבודה.');
  }
}
