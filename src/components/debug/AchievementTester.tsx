'use client';
import React, { useState } from 'react';
import { ACHIEVEMENT_DISPLAY } from '@/types/achievements';

// Component to test achievement notifications
export default function AchievementTester() {
  const [selectedAchievement, setSelectedAchievement] = useState('PERFECT_ROUND');
  
  const triggerAchievement = async () => {
    try {
      // Call the test endpoint to get the achievement data
      const response = await fetch(`/api/test-achievement?type=${selectedAchievement}`);
      const data = await response.json();
      
      if (data.success) {
        // Manually dispatch the achievement event
        const achievementEvent = new CustomEvent('achievementUnlocked', {
          detail: data.achievementData
        });
        window.dispatchEvent(achievementEvent);
        console.log(`Triggered achievement: ${selectedAchievement}`);
      } else {
        console.error('Failed to trigger achievement:', data.error);
      }
    } catch (error) {
      console.error('Error testing achievement:', error);
    }
  };
  
  return (
    <div className="fixed bottom-4 right-4 bg-gray-900/70 backdrop-blur-md p-4 rounded-xl border border-gray-700 z-50">
      <h3 className="text-sm font-medium text-gray-300 mb-2">Achievement Test Panel</h3>
      <div className="flex gap-2">
        <select 
          value={selectedAchievement}
          onChange={(e) => setSelectedAchievement(e.target.value)}
          className="bg-gray-800 text-gray-300 rounded px-2 py-1 text-xs border border-gray-700"
        >
          {Object.keys(ACHIEVEMENT_DISPLAY).map(achievementKey => (
            <option key={achievementKey} value={achievementKey}>
              {ACHIEVEMENT_DISPLAY[achievementKey].name}
            </option>
          ))}
        </select>
        <button
          onClick={triggerAchievement}
          className="bg-purple-800 hover:bg-purple-700 text-purple-100 rounded px-3 py-1 text-xs"
        >
          Test
        </button>
      </div>
    </div>
  );
}