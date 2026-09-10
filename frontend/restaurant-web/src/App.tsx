import { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { InventoryView } from './components/InventoryView';
import { OperationsHub } from './components/OperationsHub';
import { MasterDataView } from './components/MasterDataView';
import { OperationsModals } from './components/OperationsModals';
import type { ActiveModal } from './types';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import './App.css';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

const MainAppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'inventory' | 'operations' | 'masterData'>('inventory');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const handleModalSuccess = (message: string) => {
    addToast(message, 'success');
    setRefreshTrigger((prev) => prev + 1);
  };

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="app-wrapper">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="main-content">
        {activeTab === 'inventory' && (
          <InventoryView
            onOpenModal={setActiveModal}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'operations' && (
          <OperationsHub onOpenModal={setActiveModal} />
        )}

        {activeTab === 'masterData' && (
          <MasterDataView onSuccess={(msg) => {
            addToast(msg, 'success');
            setRefreshTrigger((prev) => prev + 1);
          }} />
        )}
      </main>

      {/* Global Stock Operations Modal Suite */}
      <OperationsModals
        modal={activeModal}
        onClose={() => setActiveModal(null)}
        onSuccess={handleModalSuccess}
      />

      {/* Toasts Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald" />
            ) : (
              <AlertCircle size={18} className="text-rose" />
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
