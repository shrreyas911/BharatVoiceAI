
export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface TranscriptionEntry {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum CallStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  DISCONNECTING = 'DISCONNECTING'
}
