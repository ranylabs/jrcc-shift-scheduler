import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const COLLECTION = 'employees';

export function subscribeEmployees(onUpdate) {
  if (!isFirebaseConfigured || !db) {
    onUpdate([]);
    return () => {};
  }

  const employeesQuery = query(collection(db, COLLECTION), orderBy('name'));
  return onSnapshot(employeesQuery, (snapshot) => {
    const employees = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    onUpdate(employees);
  });
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