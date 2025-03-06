import React from 'react';

export default function TestStyleComponent() {
  return (
    <div className="absolute top-0 left-0 w-full p-4 z-50 bg-gray-800 rounded-md shadow-lg border border-purple-500">
      <h2 className="text-xl font-bold mb-2 text-white">Tailwind Test</h2>
      <p className="text-sm text-white">If you can see this styled box, Tailwind is working! You can remove this component after confirming styles work.</p>
    </div>
  );
}
