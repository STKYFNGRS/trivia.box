// This component has been removed per user request to avoid showing notifications
// when wallet connections are restored

'use client';

interface MobileRestoreNotificationProps {
  message?: string;
  duration?: number;
  show: boolean;
  onClose?: () => void;
}

// Empty component that doesn't render anything
export default function MobileRestoreNotification({
  message,
  duration,
  show,
  onClose
}: MobileRestoreNotificationProps) {
  // If show becomes true, immediately call onClose to prevent any pending state
  if (show && onClose) {
    setTimeout(onClose, 0);
  }
  
  // Return null instead of rendering a notification
  return null;
}
