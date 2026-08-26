declare module 'wwebjs-mongo' {
  import type { Mongoose } from 'mongoose';

  /** Session store backing whatsapp-web.js RemoteAuth with MongoDB GridFS. */
  export class MongoStore {
    constructor(options: { mongoose: Mongoose });
    sessionExists(options: { session: string }): Promise<boolean>;
    save(options: { session: string }): Promise<void>;
    extract(options: { session: string; path: string }): Promise<void>;
    delete(options: { session: string }): Promise<void>;
  }
}
