interface SavedEquipment<T> { value: T; savedAt: string }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Storage unavailable')); return; }
    const request = indexedDB.open('mt-info-official-data', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('equipment');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage blocked'));
  });
}

/** IndexedDB avoids synchronous JSON/string storage and its small localStorage quota. */
export async function saveEquipment<T>(key: string, value: T): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('equipment', 'readwrite');
      transaction.objectStore('equipment').put({ value, savedAt: new Date().toISOString() }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function loadEquipment<T>(key: string): Promise<SavedEquipment<T> | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('equipment').objectStore('equipment').get(key);
      request.onsuccess = () => {
        const saved = request.result;
        resolve(saved && typeof saved.savedAt === 'string' && Array.isArray(saved.value?.items) ? saved : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
