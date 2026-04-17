
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    isAlert?: boolean;
}

export function ConfirmModal({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = 'Confirmar', 
    cancelText = 'Cancelar',
    loading = false,
    isAlert = false
}: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-6 flex gap-4">
                    <div className={`p-3 rounded-full h-fit shrink-0 ${isAlert ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-600'}`}>
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                        <p className="text-gray-600">{message}</p>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                    {!isAlert && (
                        <button 
                            onClick={onCancel}
                            disabled={loading}
                            className="px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button 
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-4 py-2 font-medium text-white rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-2 ${isAlert ? 'bg-teal-600 hover:bg-teal-700' : 'bg-red-600 hover:bg-red-700'}`}
                    >
                        {loading ? 'Aguarde...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
