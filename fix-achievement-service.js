const fs = require('fs');
const path = require('path');

// Very simple script to fix just the checkPerfectGames method which is corrupted
const filePath = path.join(__dirname, 'src', 'services', 'achievements', 'AchievementService.ts');

// Read the current file
let content = fs.readFileSync(filePath, 'utf8');

// Look for the corrupted section
if (content.includes('user_id: userId')) {
  const corruptedSection = 
`  async checkPerfectGames(userId: number): Promise<boolean> {
    try {
      // Get user's game sessions
      const gameSessions = await prisma.trivia_game_sessions.findMany({
        where: {
          trivia_player_responses: {
            some: {
              user_id: userId
            }
      
      return achievementsList.filter(Boolean);
    } catch (error) {
      console.error('Error in processGameEnd:', error);
      return [];
    }
  }
}`;

  const fixedSection = 
`  async checkPerfectGames(userId: number): Promise<boolean> {
    try {
      // Get user's game sessions
      const gameSessions = await prisma.trivia_game_sessions.findMany({
        where: {
          trivia_player_responses: {
            some: {
              user_id: userId
            }
          },
          status: 'completed'
        },
        select: {
          id: true
        }
      });`;

  // Replace the corrupted section with the fixed one
  content = content.replace(corruptedSection, fixedSection);
  
  // Write the fixed file
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Fixed the corrupted checkPerfectGames method!");
} else {
  console.log("Could not find the corrupted section to fix.");
}
