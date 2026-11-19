import { STORAGE_KEY, type Persistence } from "./domain";
export function browserPersistence(storage: Storage): Persistence {
  return {
    read: () => storage.getItem(STORAGE_KEY),
    write: (value) => storage.setItem(STORAGE_KEY, value),
  };
}
