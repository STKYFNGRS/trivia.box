// Achievement definition
export interface Achievement {
  id: number
  user_id: number
  token_id?: number
  achievement_type: string
  week_number: number
  year: number
  score: number
  minted_at: Date
}

// Achievement criteria
export interface AchievementCriteria {
  type: string
  name: string
  description: string
  threshold: number
  points_multiplier: number
  image_url?: string
}

// POAP metadata
export interface POAPMetadata {
  name: string
  description: string
  external_url: string
  image: string
  attributes: POAPAttribute[]
}

// POAP attribute
export interface POAPAttribute {
  trait_type: string
  value: string | number
}

// Achievement progress
export interface AchievementProgress {
  criteria: AchievementCriteria
  current_value: number
  progress_percentage: number
  achieved: boolean
  achievement_date?: Date
}

// Weekly achievement summary
export interface WeeklyAchievements {
  week_number: number
  year: number
  achievements: Achievement[]
  total_score: number
  rank: number
}

// Achievement distribution stats
export interface AchievementStats {
  type: string
  total_awarded: number
  unique_recipients: number
  average_score: number
  last_awarded: Date
}