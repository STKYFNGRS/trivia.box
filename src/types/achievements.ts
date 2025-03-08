export type AchievementIcon = 'TROPHY' | 'FLAME' | 'STAR' | 'TARGET' | 'MEDAL';

export interface AchievementDisplay {
  name: string;
  description: string;
  icon: AchievementIcon;
  category: 'MASTERY' | 'STREAK' | 'SPEED' | 'COLLECTION' | 'SPECIAL';
  total: number;
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  category: AchievementDisplay['category'];
  achieved: boolean;
  progress: number;
  total: number;
  unlockedAt: Date | null;
}

// Achievement definitions
export const ACHIEVEMENT_DISPLAY: Record<string, AchievementDisplay> = {
  'FIRST_WIN': {
    name: 'First Win',
    description: 'Win your first game',
    icon: 'TROPHY',
    category: 'SPECIAL',
    total: 1
  },
  'STREAK_3': {
    name: 'On Fire',
    description: 'Get a 3x streak',
    icon: 'FLAME',
    category: 'STREAK',
    total: 3
  },
  'STREAK_5': {
    name: 'Unstoppable',
    description: 'Get a 5x streak',
    icon: 'FLAME',
    category: 'STREAK',
    total: 5
  },
  // Perfect Game achievements
  'PERFECT_GAME': {
    name: 'Perfect Game',
    description: 'Answer all questions correctly in a game',
    icon: 'STAR',
    category: 'MASTERY',
    total: 1
  },
  'PERFECT_ROUND': {
    name: 'Perfect Game',
    description: 'Number of perfect games completed',
    icon: 'STAR',
    category: 'MASTERY',
    total: 1
  },
  'BLOCKCHAIN_PIONEER': {
    name: 'Blockchain Pioneer',
    description: 'Connect your web3 wallet and play your first game',
    icon: 'MEDAL',
    category: 'SPECIAL',
    total: 1
  },
  'SPEED_DEMON': {
    name: 'Speed Demon',
    description: 'Answer 10 questions correctly in under 3 seconds each',
    icon: 'FLAME',
    category: 'SPEED',
    total: 10
  },

  'STREAK_MASTER': {
    name: 'Streak Master',
    description: 'Achieve a streak of 10 correct answers',
    icon: 'FLAME',
    category: 'STREAK',
    total: 10
  },
  'DAILY_PLAYER': {
    name: 'Daily Player',
    description: 'Play games 7 days in a row',
    icon: 'TARGET',
    category: 'STREAK',
    total: 7
  },
// Category achievements with consistent naming pattern (always lowercase for DB lookups)
  'science_master': {
    name: 'Science Master',
    description: 'Answer 50 science questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'technology_master': {
    name: 'Tech Guru',
    description: 'Answer 50 technology questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'popculture_master': {
    name: 'Pop Culture Expert',
    description: 'Answer 50 pop culture questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'history_master': {
    name: 'History Buff',
    description: 'Answer 50 history questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'geography_master': {
    name: 'Geography Whiz',
    description: 'Answer 50 geography questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'sports_master': {
    name: 'Sports Fanatic',
    description: 'Answer 50 sports questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'gaming_master': {
    name: 'Gaming Legend',
    description: 'Answer 50 gaming questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'literature_master': {
    name: 'Literary Scholar',
    description: 'Answer 50 literature questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'internet_master': {
    name: 'Internet Savvy',
    description: 'Answer 50 internet questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'movies_master': {
    name: 'Movie Buff',
    description: 'Answer 50 movie questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'music_master': {
    name: 'Music Maestro',
    description: 'Answer 50 music questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },


  'TRIVIA_MASTER': {
    name: 'Trivia Master',
    description: 'Complete at least 5 category-specific achievements',
    icon: 'TROPHY',
    category: 'MASTERY',
    total: 5
  },
  'QUICK_THINKER': {
    name: 'Quick Thinker',
    description: 'Answer 25 questions correctly in under 5 seconds each',
    icon: 'FLAME',
    category: 'SPEED',
    total: 25
  },
  'MARATHON_PLAYER': {
    name: 'Marathon Player',
    description: 'Play 50 trivia games',
    icon: 'TARGET',
    category: 'COLLECTION',
    total: 50
  },
  'DIFFICULTY_MASTER': {
    name: 'Difficulty Master',
    description: 'Win games on all difficulty levels',
    icon: 'STAR',
    category: 'COLLECTION',
    total: 3
  },

  // Add aliases for backwards compatibility if needed
  'SCIENCE_MASTER': {
    name: 'Science Master',
    description: 'Answer 50 science questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'TECH_GURU': {
    name: 'Tech Guru',
    description: 'Answer 50 technology questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'POP_CULTURE_EXPERT': {
    name: 'Pop Culture Expert',
    description: 'Answer 50 pop culture questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  },
  'HISTORY_BUFF': {
    name: 'History Buff',
    description: 'Answer 50 history questions correctly',
    icon: 'MEDAL',
    category: 'MASTERY',
    total: 50
  }
};