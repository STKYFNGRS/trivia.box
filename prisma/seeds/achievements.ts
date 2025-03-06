import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getWeekNumber(date: Date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

const achievements = [
  {
    achievement_type: 'FIRST_WIN',
    score: 1,
    streak_milestone: 1,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  },
  {
    achievement_type: 'STREAK_3',
    score: 0,
    streak_milestone: 3,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  },
  {
    achievement_type: 'STREAK_5',
    score: 0,
    streak_milestone: 5,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  },
  {
    achievement_type: 'PERFECT_ROUND',
    score: 10,
    streak_milestone: 0,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  },
  {
    achievement_type: 'SPEED_DEMON',
    score: 0,
    fastest_response: 2000,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  },
  {
    achievement_type: 'CATEGORY_MASTER',
    score: 50,
    streak_milestone: 0,
    week_number: getWeekNumber(new Date()),
    year: new Date().getFullYear()
  }
];

async function seedAchievements() {
  // Get the system user ID
  const systemUser = await prisma.trivia_users.findUnique({
    where: { wallet_address: 'system' }
  });

  if (!systemUser) {
    throw new Error('System user not found. Please run setup-system-user.ts first.');
  }

  for (const achievement of achievements) {
    const existing = await prisma.trivia_achievements.findFirst({
      where: {
        user_id: systemUser.id,
        achievement_type: achievement.achievement_type
      }
    });

    if (!existing) {
      await prisma.trivia_achievements.create({
        data: {
          user_id: systemUser.id,
          ...achievement
        }
      });
    }
  }

  console.log('Achievement templates seeded successfully');
}

seedAchievements()
  .catch((e) => {
    console.error('Error seeding achievements:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });