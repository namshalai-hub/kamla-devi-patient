import { useState, useEffect } from 'react';
import { PatientLogin } from './components/PatientLogin';
import { PatientPortal } from './components/PatientPortal';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import type { Patient } from './types/crm';
import { Loader2, Heart } from 'lucide-react';

function App() {
  const [loggedPatient, setLoggedPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string>('');

  // 1. Check if patient was already logged in on this browser
  useEffect(() => {
    const checkSession = async () => {
      const savedPatientId = localStorage.getItem('logged_patient_id');
      if (savedPatientId && isSupabaseConfigured() && supabase) {
        try {
          const { data, error } = await supabase
            .from('patients')
            .select('data')
            .eq('id', savedPatientId)
            .single();

          if (error) {
            console.error('Session validation error:', error);
            // Clear expired/invalid session
            localStorage.removeItem('logged_patient_id');
          } else if (data && data.data) {
            setLoggedPatient(data.data as Patient);
          }
        } catch (e) {
          console.error('Failed to validate session:', e);
        }
      }
      setIsLoading(false);
    };

    checkSession();
  }, []);

  // 2. Handle login success
  const handleLoginSuccess = (patient: Patient) => {
    setLoggedPatient(patient);
    localStorage.setItem('logged_patient_id', patient.id);
  };

  // 3. Handle logout
  const handleLogout = () => {
    setLoggedPatient(null);
    localStorage.removeItem('logged_patient_id');
  };

  // 4. Handle patient profile updates (e.g. uploading report)
  const handleUpdatePatient = async (updatedPatient: Patient) => {
    setLoggedPatient(updatedPatient);
    setSyncError('');

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('patients')
          .upsert({
            id: updatedPatient.id,
            name: updatedPatient.name,
            dob: updatedPatient.dob,
            status: updatedPatient.status,
            data: updatedPatient
          });

        if (error) {
          console.error('Supabase upsert error:', error);
          setSyncError('Changes saved locally, but failed to sync to the server. Please try again.');
        }
      } catch (e) {
        console.error('Network error during sync:', e);
        setSyncError('Connection issue. Changes saved locally, but failed to sync to the server.');
      }
    } else {
      setSyncError('Database connection not configured. Changes saved locally.');
    }
  };

  // 5. Render Loading Screen
  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 10% 20%, var(--primary-light) 0%, var(--bg-app) 90%)',
        gap: '20px'
      }}>
        <div style={{
          display: 'inline-flex',
          width: '64px',
          height: '64px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px var(--primary-light)',
          animation: 'pulse 2s infinite'
        }}>
          <Heart size={32} fill="white" style={{ color: 'white' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 600 }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Securing connection & loading your clinical records...</span>
        </div>
      </div>
    );
  }

  // 6. Main render flow
  return (
    <>
      {loggedPatient ? (
        <>
          {syncError && (
            <div style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              background: 'var(--primary-light)',
              border: '1px solid var(--border)',
              padding: '12px 18px',
              borderRadius: '8px',
              color: 'var(--primary)',
              fontSize: '13px',
              fontWeight: 500,
              zIndex: 99999,
              boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚠️ {syncError}</span>
            </div>
          )}
          <PatientPortal
            patient={loggedPatient}
            appointments={loggedPatient.appointments || []}
            onUpdatePatient={handleUpdatePatient}
            onLogout={handleLogout}
          />
        </>
      ) : (
        <PatientLogin onLoginSuccess={handleLoginSuccess} />
      )}
    </>
  );
}

export default App;
