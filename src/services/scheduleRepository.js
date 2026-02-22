import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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

export function subscribeScheduleByMonth(monthKey, onUpdate, onError) {
  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(null);
        return;
      }

      const data = snapshot.data();
      onUpdate({
        monthKey,
        schedule: data.schedule ?? {},
        scheduleMeta: data.scheduleMeta ?? {}
      });
    },
    (error) => {
      if (onError) {
        onError(error);
      }
    }
  );
}

function assertFirebase() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('פיירבייס לא מוגדר. יש למלא משתני VITE_FIREBASE בסביבת העבודה.');
  }
}
