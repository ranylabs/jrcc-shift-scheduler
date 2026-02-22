import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION = 'employees';

export async function loadEmployeesOnce() {
  if (!isFirebaseConfigured || !db) {
    return [];
  }

  const employeesQuery = query(collection(db, COLLECTION), orderBy('name'));
  const snapshot = await getDocs(employeesQuery);
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));
}

export async function upsertEmployee(employee) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('הענן לא מוגדר.');
  }

  await setDoc(doc(db, COLLECTION, employee.id), employee, { merge: true });
}

export async function deleteEmployeeById(employeeId) {
  if (!isFirebaseConfigured || !db) {
    throw new Error('הענן לא מוגדר.');
  }

  await deleteDoc(doc(db, COLLECTION, employeeId));
}
