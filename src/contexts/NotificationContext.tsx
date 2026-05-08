import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
    id: string;
    type: NotificationType;
    message: string;
}

interface NotificationContextType {
    showNotification: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const showNotification = useCallback((type: NotificationType, message: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        setNotifications((prev) => {
            const newList = [...prev, { id, type, message }];
            // Limit to max 3 notifications to avoid screen clutter
            return newList.slice(-3);
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 5000);
    }, []);

    const removeNotification = (id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none max-w-md w-full px-4 sm:px-0">
                {notifications.map((n) => (
                    <Toast 
                        key={n.id} 
                        notification={n} 
                        onClose={() => removeNotification(n.id)} 
                    />
                ))}
            </div>
        </NotificationContext.Provider>
    );
}

function Toast({ notification, onClose }: { notification: Notification; onClose: () => void }) {
    const icons = {
        success: <CheckCircle className="text-green-500" size={20} />,
        error: <AlertCircle className="text-red-500" size={20} />,
        info: <Info className="text-blue-500" size={20} />,
        warning: <AlertTriangle className="text-amber-500" size={20} />,
    };

    const bgColors = {
        success: 'bg-green-50 border-green-100',
        error: 'bg-red-50 border-red-100',
        info: 'bg-blue-50 border-blue-100',
        warning: 'bg-amber-50 border-amber-100',
    };

    return (
        <div 
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${bgColors[notification.type]} backdrop-blur-md bg-opacity-90 w-full sm:w-96 mx-auto`}
            role="alert"
        >
            <div className="shrink-0 mt-0.5">
                {icons[notification.type]}
            </div>
            <div className="flex-1 text-sm font-medium text-gray-800">
                {notification.message}
            </div>
            <button 
                onClick={onClose}
                className="shrink-0 text-gray-400 hover:text-gray-600 transition"
            >
                <X size={18} />
            </button>
        </div>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
