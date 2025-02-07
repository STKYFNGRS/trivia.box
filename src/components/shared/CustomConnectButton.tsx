'use client';

// Component now uses AppKit's built-in button
export default function CustomConnectButton() {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* @ts-expect-error Suppressing TS error for React v19 compatibility */}
      <appkit-button />
      <span className="text-sm text-white/50">Open Beta</span>
    </div>
  );
}