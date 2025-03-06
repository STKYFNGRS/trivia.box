// Activity log types
export enum ActivityLogType {
  ANSWER = 'ANSWER',
  SESSION = 'SESSION',
  ACHIEVEMENT = 'ACHIEVEMENT',
  VIOLATION = 'VIOLATION',
  SCORE_PERSISTENCE = 'SCORE_PERSISTENCE'
}

// Security log types
export interface SecurityLog {
  id: number;
  session_id: number;
  activity_type: ActivityLogType;
  details: Record<string, unknown>;
  logged_at: Date;
}

export interface SecurityLogCount {
  count: string;
}

export interface SecurityLogDetails {
  type: SecurityLogType;
  timestamp: string;
  questionIds?: number[];
  questionCount?: number;
  selectionCriteria?: Record<string, unknown>;
  questionsPerRound?: number;
  details?: string | Record<string, unknown>;
  achievements?: string[];
  response_id?: number;
  session_id?: number;
  [key: string]: unknown;  // More type-safe than 'any'
}

export type SecurityLogType = 
  | 'session_created' 
  | 'question_answered' 
  | 'session_completed' 
  | 'security_violation'
  | 'rate_limit_exceeded'
  | 'invalid_response'
  | 'achievements_awarded'
  | 'score_persistence';