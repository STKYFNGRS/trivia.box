'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FixUserStatsPage() {
  const [userId, setUserId] = useState('1');
  const [newStreak, setNewStreak] = useState('0');
  const [adminKey, setAdminKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch(`/api/fix-streak?userId=${userId}&streak=${newStreak}&key=${adminKey}`);
      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: data.message });
        // Force a refresh of the data from the API
        localStorage.removeItem(`trivia-user-stats-${userId}`);
        // Force refresh
        router.refresh();
      } else {
        setResult({ success: false, error: data.error || 'Unknown error occurred' });
      }
    } catch (error) {
      setResult({ success: false, error: 'Failed to update streak. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-amber-500 mb-6">Fix User Stats - Admin Tool</h1>
        
        <div className="bg-gray-800/70 rounded-lg p-6 border border-amber-500/20">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-gray-300 mb-1">
                User ID
              </label>
              <input
                type="text"
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full bg-gray-700/80 border border-gray-600 rounded-md p-2 text-white"
                required
              />
            </div>
            
            <div>
              <label htmlFor="newStreak" className="block text-sm font-medium text-gray-300 mb-1">
                New Streak Value
              </label>
              <input
                type="number"
                id="newStreak"
                value={newStreak}
                onChange={(e) => setNewStreak(e.target.value)}
                min="0"
                className="w-full bg-gray-700/80 border border-gray-600 rounded-md p-2 text-white"
                required
              />
            </div>
            
            <div>
              <label htmlFor="adminKey" className="block text-sm font-medium text-gray-300 mb-1">
                Admin Key
              </label>
              <input
                type="password"
                id="adminKey"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="w-full bg-gray-700/80 border border-gray-600 rounded-md p-2 text-white"
                placeholder="Enter admin key"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md transition-colors duration-200 disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update User Streak'}
            </button>
          </form>
          
          {result && (
            <div className={`mt-4 p-3 rounded-md ${result.success ? 'bg-green-900/50 border border-green-500/30' : 'bg-red-900/50 border border-red-500/30'}`}>
              {result.success ? (
                <p className="text-green-300">{result.message}</p>
              ) : (
                <p className="text-red-300">{result.error}</p>
              )}
            </div>
          )}
          
          <div className="mt-6 text-sm text-gray-400">
            <h3 className="font-medium text-gray-300 mb-1">Instructions:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Enter the user ID (typically 1 for the first user)</li>
              <li>Set the desired streak value</li>
              <li>Enter the admin key (default: trivia-box-admin)</li>
              <li>After update, refresh the main page to see changes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}