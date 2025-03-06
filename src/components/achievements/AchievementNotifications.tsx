'use client';

import React, { useEffect, useState } from 'react';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';
import AchievementNotification from './AchievementNotification';

export default function AchievementNotifications() {
  const [achievements, setAchievements] = useState<any[]>([]);

  useEffect(() => {
    const handleAchievementUnlocked = (event: CustomEvent) => {
      const { type, display } = event.detail;
      console.log('Achievement unlocked:', type, display);
      
      // Add new achievement to the queue
      setAchievements(prev => [...prev, { id: Date.now(), type, display }]);
    };

    // Add event listener for achievement unlocks
    window.addEventListener('achievementUnlocked', handleAchievementUnlocked as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('achievementUnlocked', handleAchievementUnlocked as EventListener);
    };
  }, []);

  const removeAchievement = (id: number) => {
    setAchievements(prev => prev.filter(achievement => achievement.id !== id));
  };

  return (
    <>
      {achievements.map((achievement) => (
        <AchievementNotification
          key={achievement.id}
          achievement={achievement.display}
          onClose={() => removeAchievement(achievement.id)}
        />
      ))}
    </>
  );
}