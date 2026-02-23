"use client";

import React, { useEffect, useState } from 'react';
import { Info, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import { Toast, useToast } from './ToastContext';
import { cn } from '@/lib/utils';

interface ToastItemProps {
  toast: Toast;
}

const toastIcons = {
  info: <Info className="w-5 h-5 text-blue-400" />,
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  error: <XCircle className="w-5 h-5 text-red-400" />,
};

const toastStyles = {
  info: "border-blue-500/20 bg-blue-500/5",
  success: "border-emerald-500/20 bg-emerald-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  error: "border-red-500/20 bg-red-500/5",
};

export function ToastItem({ toast }: ToastItemProps) {
  const { removeToast } = useToast();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
      }, toast.duration - 300); // Start exit animation 300ms before removal

      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(toast.id);
    }, 300);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 min-w-[300px] max-w-md p-4 rounded-xl border backdrop-blur-md shadow-2xl",
        toastStyles[toast.type],
        isExiting ? "animate-toast-out" : "animate-toast-in"
      )}
    >
      <div className="flex-shrink-0">
        {toastIcons[toast.type]}
      </div>
      <div className="flex-grow text-sm font-medium text-slate-200">
        {toast.message}
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
