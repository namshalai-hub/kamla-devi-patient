import React, { useState, useRef, useEffect } from 'react';
import type { Patient } from '../types/crm';
import { Heart, Shield, Key, Phone, ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { auth } from '../lib/firebaseClient';
import { supabase } from '../lib/supabaseClient';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult
} from 'firebase/auth';

interface PatientLoginProps {
  onLoginSuccess: (patient: Patient) => void;
}

const normalizePhone = (num: string): string => {
  const digits = num.replace(/\D/g, '');
  // Match standard 10-digit Indian numbers if prefixed with 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
};

const toE164 = (phone: string): string => {
  const digits = normalizePhone(phone);
  return `+91${digits}`;
};

export const PatientLogin: React.FC<PatientLoginProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<Patient | null>(null);

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Initialize invisible reCAPTCHA on mount
  useEffect(() => {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved automatically
        },
        'expired-callback': () => {
          setErrorMsg('reCAPTCHA expired. Please try again.');
        }
      });
    }
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verify that Supabase is available
      if (!supabase) {
        throw new Error('Database client not configured. Please contact the administrator.');
      }

      // 2. Fetch patient profiles to verify the phone number is registered
      const { data: cloudPatients, error: supabaseError } = await supabase.from('patients').select('data');
      if (supabaseError) {
        console.error('Supabase query error:', supabaseError);
        throw new Error('Failed to connect to the hospital database. Please try again.');
      }

      const patientRecord = cloudPatients?.map(row => row.data as Patient).find(p => {
        return p && p.contactNumber && normalizePhone(p.contactNumber) === cleanPhone;
      });

      if (!patientRecord) {
        setErrorMsg('This phone number is not registered under any patient. Please contact the hospital receptionist to register.');
        setLoading(false);
        return;
      }

      setMatchedPatient(patientRecord);

      // 3. Trigger Firebase Phone Auth OTP
      const phoneE164 = toE164(cleanPhone);

      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }

      const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setStep('otp');
      setOtp('');
    } catch (err: unknown) {
      console.error('Login request OTP error:', err);
      const firebaseErr = err as { code?: string; message?: string };
      if (firebaseErr.code === 'auth/invalid-phone-number') {
        setErrorMsg('Invalid phone number format. Please check the number.');
      } else if (firebaseErr.code === 'auth/too-many-requests') {
        setErrorMsg('Too many requests. Please wait a few minutes and try again.');
      } else if (firebaseErr.code === 'auth/quota-exceeded') {
        setErrorMsg('SMS quota exceeded. Please try again tomorrow.');
      } else if (firebaseErr.code === 'auth/operation-not-allowed') {
        setErrorMsg('Phone authentication is not configured in the backend.');
      } else {
        setErrorMsg(firebaseErr.message || 'Failed to send OTP. Please check your internet connection.');
      }
      
      // Reset reCAPTCHA
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!otp || otp.length !== 6) {
      setErrorMsg('Please enter the 6-digit OTP sent to your phone.');
      return;
    }

    if (!confirmationResult || !matchedPatient) {
      setErrorMsg('Session expired. Please request a new OTP.');
      return;
    }

    setLoading(true);
    try {
      await confirmationResult.confirm(otp);
      // Firebase auth succeeded!
      onLoginSuccess(matchedPatient);
    } catch (err: unknown) {
      console.error('OTP confirmation error:', err);
      const firebaseErr = err as { code?: string };
      if (firebaseErr.code === 'auth/invalid-verification-code') {
        setErrorMsg('Invalid OTP code. Please check the code and try again.');
      } else if (firebaseErr.code === 'auth/code-expired') {
        setErrorMsg('OTP has expired. Please go back and request a new one.');
      } else {
        setErrorMsg('Verification failed. Please check the code or try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    setErrorMsg('');
    setOtp('');
    setStep('phone');
    setConfirmationResult(null);
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  };

  return (
    <div className="login-screen-wrapper" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 10% 20%, var(--primary-light) 0%, var(--bg-app) 90%)',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" ref={recaptchaContainerRef} />

      {/* Decorative Blur Orbs */}
      <div style={{ position: 'absolute', width: '350px', height: '350px', borderRadius: '50%', background: 'var(--primary)', filter: 'blur(100px)', opacity: 0.08, top: '10%', left: '10%', zIndex: 0 }} />
      <div style={{ position: 'absolute', width: '400px', height: '400px', borderRadius: '50%', background: 'var(--accent)', filter: 'blur(120px)', opacity: 0.06, bottom: '10%', right: '10%', zIndex: 0 }} />

      <div className="glass-card animate-scale-in" style={{
        width: '100%',
        maxWidth: '450px',
        padding: '40px 32px',
        zIndex: 1,
        borderRadius: '24px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(16px)'
      }}>
        {/* Header Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px var(--primary-light)',
            marginBottom: '16px'
          }}>
            <Heart size={28} fill="white" style={{ color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)' }}>Kamla Devi Hospital</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '2px' }}>
            Patient Portal
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                Registered Mobile Number
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}>
                  🇮🇳 +91
                </span>
                <input
                  type="tel"
                  placeholder="Enter 10-digit number..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="form-control"
                  style={{
                    height: '42px',
                    borderRadius: '10px',
                    paddingLeft: '80px',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                  required
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '6px', display: 'block', lineHeight: '1.4' }}>
                Enter the mobile number registered with your clinic records. We will verify your number and send an OTP.
              </span>
            </div>

            {errorMsg && (
              <div style={{
                background: 'hsl(0, 60%, 96%)',
                border: '1px solid hsl(0, 50%, 90%)',
                color: 'hsl(0, 75%, 35%)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Shield size={14} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ height: '44px', borderRadius: '10px', fontWeight: 600, fontSize: '14px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Checking records...</>
              ) : (
                <><Phone size={16} /> Send Verification OTP</>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              background: 'var(--primary-light)',
              border: '1px solid var(--border)',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '12px',
              color: 'var(--text-main)',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              <div>OTP sent to registered number:</div>
              <strong style={{ fontSize: '13px', color: 'var(--primary)' }}>+91 {normalizePhone(phone)}</strong>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, hsl(142, 70%, 96%) 0%, hsl(160, 65%, 94%) 100%)',
              border: '1px solid hsl(142, 50%, 85%)',
              padding: '12px',
              borderRadius: '10px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(34, 197, 94, 0.05)'
            }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'hsl(142, 60%, 35%)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                ✅ SMS Verification Sent
              </span>
              <span style={{ fontSize: '12px', color: 'hsl(142, 50%, 30%)' }}>
                Please enter the 6-digit code to securely load your profile.
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                Verification Code
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP..."
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="form-control"
                  autoFocus
                  style={{
                    height: '42px',
                    borderRadius: '10px',
                    paddingLeft: '36px',
                    fontSize: '20px',
                    letterSpacing: '8px',
                    fontWeight: 700,
                    textAlign: 'center'
                  }}
                  required
                />
                <Key size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              </div>
            </div>

            {errorMsg && (
              <div style={{
                background: 'hsl(0, 60%, 96%)',
                border: '1px solid hsl(0, 50%, 90%)',
                color: 'hsl(0, 75%, 35%)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Shield size={14} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ height: '44px', borderRadius: '10px', fontWeight: 600, fontSize: '14px', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</>
              ) : (
                <>Verify & Open Portal</>
              )}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setErrorMsg('');
                  setConfirmationResult(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px'
                }}
              >
                <ArrowLeft size={12} /> Back
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px'
                }}
              >
                <RefreshCw size={12} /> Resend OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
