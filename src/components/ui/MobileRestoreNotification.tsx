'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface MobileRestoreNotificationProps {
  message?: string;
  duration?: number;
  show: boolean;
  onClose?: () => void;
}

export default function MobileRestoreNotification({
  message = 'Game session restored after refresh',
  duration = 3000,
  show,
  onClose
}: MobileRestoreNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      
      // Auto-hide after duration
      const timeout = setTimeout(() => {
        setIsVisible(false);
        if (onClose) onClose();
      }, duration);
      
      return () => clearTimeout(timeout);
    }
  }, [show, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50"
        >
          <div className="rounded-lg bg-green-600/90 text-white p-3 px-4 shadow-lg border border-green-500/40 flex items-center gap-2 max-w-xs">
            <Check className="h-5 w-5 text-white" />
            <span className="text-sm font-medium">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
