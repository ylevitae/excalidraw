import { ExcalidrawElement } from "../element/types";
import { AppState, LibraryItems } from "../types";
import { clearAppStateForIndexedDB, getDefaultAppState } from "../appState";
import { restore } from "./restore";
import { openDB } from "idb";

const LOCAL_STORAGE_KEY = "excalidraw";
const LOCAL_STORAGE_KEY_STATE = "excalidraw-state";
const LOCAL_STORAGE_KEY_COLLAB = "excalidraw-collab";
const LOCAL_STORAGE_KEY_LIBRARY = "excalidraw-library";

let _LATEST_LIBRARY_ITEMS: LibraryItems | null = null;
const getDb = (): Promise<any> => {
  return openDB(LOCAL_STORAGE_KEY, undefined, {
    async upgrade(db) {
      db.createObjectStore(LOCAL_STORAGE_KEY);
    },
  });
};

export const loadLibrary = async (): Promise<LibraryItems> => {
  return new Promise(async (resolve) => {
    if (_LATEST_LIBRARY_ITEMS) {
      return resolve(JSON.parse(JSON.stringify(_LATEST_LIBRARY_ITEMS)));
    }

    try {
      const store = (await getDb())
        .transaction(LOCAL_STORAGE_KEY, "readwrite")
        .objectStore(LOCAL_STORAGE_KEY);
      const data = await store.get(LOCAL_STORAGE_KEY_LIBRARY);
      if (!data) {
        return resolve([]);
      }

      const items = (JSON.parse(data) as LibraryItems).map(
        (elements) => restore({ elements, appState: null }).elements,
      ) as Mutable<LibraryItems>;

      // clone to ensure we don't mutate the cached library elements in the app
      _LATEST_LIBRARY_ITEMS = JSON.parse(JSON.stringify(items));

      resolve(items);
    } catch (e) {
      console.error(e);
      resolve([]);
    }
  });
};

export const saveLibrary = async (items: LibraryItems) => {
  const store = (await getDb())
    .transaction(LOCAL_STORAGE_KEY, "readwrite")
    .objectStore(LOCAL_STORAGE_KEY);
  const prevLibraryItems = _LATEST_LIBRARY_ITEMS;
  try {
    const serializedItems = JSON.stringify(items);
    // cache optimistically so that consumers have access to the latest
    //  immediately
    _LATEST_LIBRARY_ITEMS = JSON.parse(serializedItems);
    await store.put(serializedItems, LOCAL_STORAGE_KEY_LIBRARY);
  } catch (e) {
    _LATEST_LIBRARY_ITEMS = prevLibraryItems;
    console.error(e);
  }
};

export const saveUsernameToIndexedDb = async (username: string) => {
  const store = (await getDb())
    .transaction(LOCAL_STORAGE_KEY, "readwrite")
    .objectStore(LOCAL_STORAGE_KEY);

  try {
    await store.put(JSON.stringify({ username }), LOCAL_STORAGE_KEY_COLLAB);
  } catch (error) {
    // Unable to access window.localStorage
    console.error(error);
  }
};

export const importUsernameFromIndexedDb = async (): Promise<string | null> => {
  try {
    const store = (await getDb())
      .transaction(LOCAL_STORAGE_KEY, "readwrite")
      .objectStore(LOCAL_STORAGE_KEY);
    const data = await store.get(LOCAL_STORAGE_KEY_COLLAB);
    if (data) {
      return JSON.parse(data).username;
    }
  } catch (error) {
    // Unable to access localStorage
    console.error(error);
  }

  return null;
};

export const saveToIndexedDb = async (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  try {
    const store = (await getDb())
      .transaction(LOCAL_STORAGE_KEY, "readwrite")
      .objectStore(LOCAL_STORAGE_KEY);
    await store.put(
      JSON.stringify(elements.filter((element) => !element.isDeleted)),
      LOCAL_STORAGE_KEY,
    );
    await store.put(
      JSON.stringify(clearAppStateForIndexedDB(appState)),
      LOCAL_STORAGE_KEY_STATE,
    );
  } catch (error) {
    // Unable to access window.indexedDB
    console.error(error);
  }
};

export const importFromIndexedDb = async () => {
  let savedElements = null;
  let savedState = null;

  try {
    const store = (await getDb())
      .transaction(LOCAL_STORAGE_KEY, "readwrite")
      .objectStore(LOCAL_STORAGE_KEY);
    savedElements = await store.get(LOCAL_STORAGE_KEY);
    savedState = await store.get(LOCAL_STORAGE_KEY_STATE);
  } catch (error) {
    // Unable to access localStorage
    console.error(error);
  }

  let elements = [];
  if (savedElements) {
    try {
      elements = JSON.parse(savedElements);
    } catch (error) {
      console.error(error);
      // Do nothing because elements array is already empty
    }
  }

  let appState = null;
  if (savedState) {
    try {
      appState = {
        ...getDefaultAppState(),
        ...clearAppStateForIndexedDB(
          JSON.parse(savedState) as Partial<AppState>,
        ),
      };
    } catch (error) {
      console.error(error);
      // Do nothing because appState is already null
    }
  }
  return { elements, appState };
};
