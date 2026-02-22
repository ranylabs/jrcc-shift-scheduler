import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { disableCloud, isCloudDisabled, trackCloudListener } from './cloudMode';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION = 'schedules';

export async function saveScheduleByMonth(monthKey, payload) {
  if (isCloudDisabled()) {
    return;
  }

  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);

  try {
    await setDoc(
      ref,
      {
        monthKey,
        ...payload,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    if (handleCloudDisableError(error)) {
      return;
    }

    throw error;
  }
}

export async function loadScheduleByMonth(monthKey) {
  if (isCloudDisabled()) {
    return null;
  }

  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);

  try {
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
  } catch (error) {
    if (handleCloudDisableError(error)) {
      return null;
    }

    throw error;
  }
}

export function subscribeScheduleByMonth(monthKey, onUpdate, onError) {
  if (isCloudDisabled()) {
    onUpdate(null);
    return () => {};
  }

  assertFirebase();

  const ref = doc(db, COLLECTION, monthKey);
  const unsubscribe = onSnapshot(
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
      if (handleCloudDisableError(error)) {
        onUpdate(null);
        return;
      }

      if (onError) {
        onError(error);
      }
    }
  );

  return trackCloudListener(unsubscribe);
}

function assertFirebase() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('פיירבייס לא מוגדר. יש למלא משתני VITE_FIREBASE בסביבת העבודה.');
  }
}

function handleCloudDisableError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();

  if (
    code.includes('resource-exhausted') ||
    message.includes('resource_exhausted') ||
    message.includes('resource-exhausted') ||
    message.includes('quota exceeded')
  ) {
    disableCloud('quota reached');
    return true;
  }

  if (
    code.includes('permission-denied') ||
    message.includes('permission-denied') ||
    message.includes('permission denied')
  ) {
    disableCloud('permission denied');
    return true;
  }

  return false;
}
