export interface AttachedFile {
  name: string;
  size: number;
  type: string;
  path: string; // uploaded URL / path from SDK
}

export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isProgress?: boolean;
  files?: AttachedFile[];
}

export interface LocalThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}
