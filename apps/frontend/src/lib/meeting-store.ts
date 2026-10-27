import { chunkKey, type LocalMeeting, type MeetingChunk } from "./meeting-types";

export interface MeetingStore {
  listMeetings(): Promise<LocalMeeting[]>;
  saveMeeting(meeting: LocalMeeting): Promise<void>;
  // Metadata and audio commit together, so a reload cannot expose a counter without its blob.
  saveChunk(meeting: LocalMeeting, chunk: MeetingChunk): Promise<void>;
  listChunks(meetingId: string): Promise<MeetingChunk[]>;
  markUploaded(chunk: MeetingChunk): Promise<void>;
  deleteMeeting(id: string): Promise<void>;
}
export class IndexedMeetingStore implements MeetingStore {
  private connection?: Promise<IDBDatabase>;
  constructor(private factory: () => IDBFactory = () => indexedDB) {}
  private open() {
    return this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory().open("voitex-meeting-recordings", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("meetings", { keyPath: "id" });
        db.createObjectStore("chunks", { keyPath: ["meetingId", "part", "index"] }).createIndex("meetingId", "meetingId");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); this.connection = undefined; };
        resolve(request.result);
      };
      request.onerror = () => { this.connection = undefined; reject(request.error); };
      request.onblocked = () => reject(new Error("Lokaler Aufnahmespeicher ist durch einen anderen Tab blockiert."));
    });
  }
  private async transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? new Error("Lokales Speichern fehlgeschlagen."));
      tx.onerror = () => reject(tx.error);
      run(tx, result => { value = result; });
    });
  }
  listMeetings() {
    return this.transaction<LocalMeeting[]>(["meetings"], "readonly", (tx, result) => {
      tx.objectStore("meetings").getAll().onsuccess = event => result((event.target as IDBRequest<LocalMeeting[]>).result);
    });
  }
  saveMeeting(meeting: LocalMeeting) {
    return this.transaction<void>(["meetings"], "readwrite", tx => { tx.objectStore("meetings").put(meeting); });
  }
  saveChunk(meeting: LocalMeeting, chunk: MeetingChunk) {
    return this.transaction<void>(["meetings", "chunks"], "readwrite", tx => {
      tx.objectStore("meetings").put(meeting); tx.objectStore("chunks").put(chunk);
    });
  }
  listChunks(meetingId: string) {
    return this.transaction<MeetingChunk[]>(["chunks"], "readonly", (tx, result) => {
      tx.objectStore("chunks").index("meetingId").getAll(meetingId).onsuccess = event => result((event.target as IDBRequest<MeetingChunk[]>).result);
    });
  }
  markUploaded(chunk: MeetingChunk) {
    return this.transaction<void>(["chunks"], "readwrite", tx => {
      const store = tx.objectStore("chunks");
      const request = store.get([chunk.meetingId, chunk.part, chunk.index]);
      request.onsuccess = () => { if (request.result) store.put({ ...request.result, uploaded: true }); };
    });
  }
  deleteMeeting(id: string) {
    return this.transaction<void>(["meetings", "chunks"], "readwrite", tx => {
      tx.objectStore("meetings").delete(id);
      const request = tx.objectStore("chunks").index("meetingId").openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    });
  }
}

export class MemoryMeetingStore implements MeetingStore {
  private meetings = new Map<string, LocalMeeting>();
  private chunks = new Map<string, MeetingChunk>();
  async listMeetings() { return structuredClone([...this.meetings.values()]); }
  async saveMeeting(meeting: LocalMeeting) { this.meetings.set(meeting.id, structuredClone(meeting)); }
  async saveChunk(meeting: LocalMeeting, chunk: MeetingChunk) {
    await this.saveMeeting(meeting); this.chunks.set(chunkKey(chunk), structuredClone(chunk));
  }
  async listChunks(id: string) { return structuredClone([...this.chunks.values()].filter(chunk => chunk.meetingId === id)); }
  async markUploaded(chunk: MeetingChunk) {
    const stored = this.chunks.get(chunkKey(chunk)); if (stored) stored.uploaded = true;
  }
  async deleteMeeting(id: string) {
    this.meetings.delete(id);
    for (const [key, chunk] of this.chunks) if (chunk.meetingId === id) this.chunks.delete(key);
  }
}
