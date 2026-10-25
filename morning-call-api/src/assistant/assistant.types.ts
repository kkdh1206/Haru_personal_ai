export type AssistantSourceStatus = 'ok' | 'empty' | 'unavailable';

export type AssistantTask = {
  id: string;
  title: string;
  priority: 'high' | 'normal';
  dueAt: string | null;
  completed: boolean;
  createdAt: string | null;
  completedAt: string | null;
};

export type BriefingItem = {
  id: string;
  title: string;
  subtitle?: string;
  startAt?: string;
  endAt?: string;
  dueAt?: string | null;
  priority?: 'high' | 'normal';
  completed?: boolean;
};

export type BriefingSection = {
  type: 'schedule' | 'tasks' | 'memory';
  title: string;
  status: AssistantSourceStatus;
  items: BriefingItem[];
};
