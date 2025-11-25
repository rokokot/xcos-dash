import { RosterDashboard } from './components/dashboard/RosterDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationProvider } from './contexts/NotificationContext';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <RosterDashboard
          events={[]}
          availabilities={[]}
          days={[]}
          timeSlots={[]}
        />
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default App;
