/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import { ToastProvider } from './components/ToastProvider';
import Layout from './components/Layout';
import { AnimatePresence, motion } from 'motion/react';

const Home = lazy(() => import('./components/Home'));
const Pillars = lazy(() => import('./components/Pillars'));
const Eden = lazy(() => import('./components/Eden'));
const Profile = lazy(() => import('./components/Profile'));
const Auth = lazy(() => import('./components/Auth'));

const ScreenSkeleton: React.FC = () => (
  <div className="p-6 space-y-4 animate-pulse">
    <div className="h-5 w-40 bg-surface-container-low rounded" />
    <div className="h-24 bg-surface-container-low rounded-2xl" />
    <div className="h-24 bg-surface-container-low rounded-2xl" />
    <div className="h-24 bg-surface-container-low rounded-2xl" />
  </div>
);

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  declare props: { children: React.ReactNode };
  declare state: { hasError: boolean };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Authenticated app render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Edenify</p>
            <h1 className="text-2xl font-serif text-on-surface">Session is recovering.</h1>
            <p className="text-sm text-on-surface-variant">A temporary render issue occurred. Try reloading once.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-[0.14em]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const { user, authReady } = useApp();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [bootProgress, setBootProgress] = useState(20);
  const [bootScreenVisible, setBootScreenVisible] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [bootStatusText, setBootStatusText] = useState('Waking secure cloud services');

  const bootStageLabel = bootProgress < 35
    ? 'Verifying session token'
    : bootProgress < 70
      ? 'Loading your profile and focus layers'
      : bootProgress < 95
        ? 'Preparing alarms, notifications, and sync'
        : 'Launching Edenify';

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const custom = event as CustomEvent<{ tab?: string; layerId?: string; taskId?: string }>;
      const tab = custom.detail?.tab;
      const layerId = custom.detail?.layerId;
      const taskId = custom.detail?.taskId;

      if (tab) {
        setActiveTab(tab);
      }

      if (layerId) {
        setSelectedLayerId(layerId);
      }

      if (taskId) {
        setActiveTab('home');
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('edenify:focus-task', { detail: { taskId } }));
        }, 120);
      }
    };

    window.addEventListener('edenify:navigate', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('edenify:navigate', handleNavigate as EventListener);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const taskId = params.get('taskId');

    if (tab) {
      setActiveTab(tab);
    }

    if (taskId) {
      setActiveTab('home');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('edenify:focus-task', { detail: { taskId } }));
      }, 200);
    }
  }, [authReady]);

  useEffect(() => {
    // Listen for Service Worker update messages
    if ('serviceWorker' in navigator) {
      const handleSwMessage = (event: MessageEvent) => {
        if (event.data?.type === 'SW_UPDATE_AVAILABLE' || event.data?.type === 'UPDATE_ACTIVATED') {
          console.log('[App] Service Worker update:', event.data.message);
          
          // Show notification banner to user
          const notification = document.createElement('div');
          notification.className = 'fixed top-0 left-0 right-0 z-50 bg-emerald-500 text-white px-4 py-3 text-center shadow-lg';
          notification.innerHTML = `
            <p class="text-sm font-bold">✓ ${event.data.message}</p>
            <button onclick="window.location.reload()" class="mt-2 px-3 py-1 bg-white text-emerald-600 rounded font-bold text-xs">Refresh Now</button>
          `;
          document.body.appendChild(notification);
          
          if (event.data?.type === 'UPDATE_ACTIVATED') {
            setTimeout(() => window.location.reload(), 2000);
          }
        }
      };

      navigator.serviceWorker.addEventListener('message', handleSwMessage);
      
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryId: number | null = null;

    const pingBackend = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3200);
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!cancelled && response.ok) {
          setBackendReady(true);
          setBootStatusText('Cloud connected. Finalizing your session');
          return;
        }
      } catch {
        // Retry until success.
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (cancelled) return;
      setBackendReady(false);
      setBootStatusText('Starting your cloud workspace');
      retryId = window.setTimeout(() => {
        void pingBackend();
      }, 2400);
    };

    void pingBackend();

    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let heartbeatId: number | null = null;

    const pingHeartbeat = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;

      try {
        await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
        });
      } catch {
        // Ignore background heartbeat failures.
      }
    };

    const startHeartbeat = () => {
      if (heartbeatId) window.clearInterval(heartbeatId);
      heartbeatId = window.setInterval(() => {
        void pingHeartbeat();
      }, 4 * 60 * 1000);
    };

    const stopHeartbeat = () => {
      if (heartbeatId) {
        window.clearInterval(heartbeatId);
        heartbeatId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pingHeartbeat();
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    handleVisibility();

    return () => {
      cancelled = true;
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!authReady || backendReady) return;

    const openAnywayTimer = window.setTimeout(() => {
      setBootStatusText('Network is slow. Opening app and retrying cloud connection in background.');
      setBackendReady(true);
    }, 12000);

    return () => {
      window.clearTimeout(openAnywayTimer);
    };
  }, [authReady, backendReady]);

  useEffect(() => {
    if (authReady) {
      setBootProgress((current) => Math.max(current, 60));
      const finishInterval = window.setInterval(() => {
        setBootProgress((current) => {
          const next = Math.min(100, current + 8);
          if (next >= 100) {
            window.clearInterval(finishInterval);
            setBootScreenVisible(false);
          }
          return next;
        });
      }, 40);

      return () => {
        window.clearInterval(finishInterval);
      };
    }

    setBootScreenVisible(true);
    const startMs = Date.now();
    const warmupInterval = window.setInterval(() => {
      const elapsed = Date.now() - startMs;
      const cap = elapsed < 450 ? 48 : elapsed < 1100 ? 78 : 94;
      setBootProgress((current) => {
        if (current >= cap) return current;
        return Math.min(cap, current + 3);
      });
    }, 30);

    return () => {
      window.clearInterval(warmupInterval);
    };
  }, [authReady, backendReady]);

  if (bootScreenVisible) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center space-y-4">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.22em] font-bold text-primary"
          >
            Edenify
          </motion.p>
          <div className="h-2 w-full rounded-full bg-surface-container-low overflow-hidden mx-auto">
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: `${bootProgress}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-primary to-primary-container"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] font-bold text-outline">
            <span>{bootStageLabel}</span>
            <span>{bootProgress}%</span>
          </div>
          <p className="text-sm text-on-surface-variant">Loading your session.</p>
          <p className="text-xs text-on-surface-variant/80">{bootStatusText}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<ScreenSkeleton />}>
        <Auth />
      </Suspense>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <Home />;
      case 'layers': return <Pillars initialLayerId={selectedLayerId} />;
      case 'eden': return <Eden />;
      case 'profile': return <Profile />;
      default: return <Home />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="h-full"
        >
          <Suspense fallback={<ScreenSkeleton />}>
            {renderContent()}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
};

export default function App() {
  return (
    <AppProvider>
      <ToastProvider />
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </AppProvider>
  );
}

