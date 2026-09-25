import { EventEmitter } from 'events';

// Create a global event emitter for distributing real-time updates inside the Next.js process.
// This handles broadcasting message events, typing indicator states, and user presence toggles.
const globalEmitter = new EventEmitter();
globalEmitter.setMaxListeners(1000);

export const chatEmitter = globalEmitter;
