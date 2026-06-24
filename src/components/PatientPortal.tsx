import React, { useState, useEffect } from 'react';
import type { Patient, Appointment, ConsultationRecord, PathologyReport } from '../types/crm';
import { LogOut, Heart, Calendar, Clock, Clipboard, Pill, Download, Bell, Activity, Camera, Image as ImageIcon, Trash2, Printer } from 'lucide-react';
import { messaging, requestForToken } from '../lib/firebaseClient';
import { onMessage } from 'firebase/messaging';

const formatDateDMY = (dateInput: string | Date | undefined | null): string => {
  if (!dateInput) return '—';
  try {
    let d: Date;
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      if (!trimmed) return '—';
      if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return trimmed;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed.replace(/\//g, '-');
      const parts = trimmed.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        d = new Date(trimmed);
      }
    } else {
      d = dateInput;
    }
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return String(dateInput);
  }
};

const formatTime12h = (timeStr: string | undefined | null): string => {
  if (!timeStr) return '—';
  try {
    const parts = timeStr.trim().split(':');
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1].substring(0, 2);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes} ${ampm}`;
    }
  } catch (e) {
    // ignore
  }
  return timeStr;
};

const getDayName = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    let d: Date;
    if (parts.length === 3 && parts[0].length === 4) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch (e) {
    return '';
  }
};

const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.75): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for compression.'));
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
};

interface PatientPortalProps {
  patient: Patient;
  appointments: Appointment[];
  onUpdatePatient: (updatedPatient: Patient) => void;
  onLogout: () => void;
}

export const PatientPortal: React.FC<PatientPortalProps> = ({ patient, appointments, onUpdatePatient, onLogout }) => {
  const [activePortalTab, setActivePortalTab] = useState<'timeline' | 'medications' | 'appointments' | 'reports'>('timeline');
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(true);

  useEffect(() => {
    // If permission is already granted, fetch token on mount
    if (Notification.permission === 'granted') {
      requestForToken();
    }

    // Set up foreground messaging listener
    let unsubscribe: (() => void) | undefined;
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground message received: ', payload);
        if (payload.notification) {
          const { title, body } = payload.notification;
          new Notification(title || 'New Notification', {
            body: body || '',
            icon: '/favicon.svg'
          });
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Form State for Lab Report upload inside portal
  const [reportTestName, setReportTestName] = useState('');
  const [reportLabName, setReportLabName] = useState('');
  const [reportResult, setReportResult] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportNotes, setReportNotes] = useState('');
  const [reportAttachment, setReportAttachment] = useState<string | undefined>(undefined);
  const [activePreviewReportAttachment, setActivePreviewReportAttachment] = useState<string | null>(null);

  const [activePrintRx, setActivePrintRx] = useState<ConsultationRecord | null>(null);
  const [activePrintReport, setActivePrintReport] = useState<PathologyReport | null>(null);

  // Filter appointments for this patient
  const myAppointments = appointments.filter(app => app.patientId === patient.id);

  // Get all consultations with prescriptions, sorted newest first
  const rxConsultations = patient.consultations
    ? patient.consultations.filter(con => con.prescriptions && con.prescriptions.length > 0)
    : [];

  // Generate calendar file (.ics)
  const downloadIcsFile = (app: Appointment) => {
    const formattedDate = app.date.replace(/-/g, '');
    const startHour = app.time.split(':')[0];
    const startMin = app.time.split(':')[1];
    
    // Construct UTC dates
    const startDateStr = `${formattedDate}T${startHour}${startMin}00`;
    const endDateStr = `${formattedDate}T${String(Number(startHour) + 1).padStart(2, '0')}${startMin}00`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kamla Devi EMR//Patient Portal Appointments//EN',
      'BEGIN:VEVENT',
      `UID:${app.id}@kamla-devi-emr`,
      `DTSTAMP:${startDateStr}`,
      `DTSTART:${startDateStr}`,
      `DTEND:${endDateStr}`,
      `SUMMARY:${app.purpose} - ${app.clinic}`,
      `DESCRIPTION:Appointment with ${app.doctorName} for ${app.purpose}. Please arrive 10 minutes early.`,
      `LOCATION:${app.clinic}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `appointment-${app.id}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const requestBrowserNotificationPermission = () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }
    
    if (Notification.permission === 'granted') {
      const nextState = !remindersEnabled;
      setRemindersEnabled(nextState);
      if (nextState) {
        requestForToken().then(token => {
          if (token) {
            alert('Reminders are active! Push notifications are successfully enabled.');
          } else {
            alert('Reminders are active! Standard browser alerts will be sent.');
          }
        });
      }
    } else {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setRemindersEnabled(true);
          new Notification('Reminders Enabled', {
            body: 'You will receive appointment updates and notifications here.',
            icon: '/favicon.ico'
          });
          requestForToken();
        } else {
          setRemindersEnabled(false);
          alert('Notification access was blocked. Please enable them in browser settings.');
        }
      });
    }
  };

  const handleReportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    compressImage(file, 1000, 1000, 0.5)
      .then((compressedBase64) => {
        const approximateSize = (compressedBase64.length * 3) / 4;
        if (approximateSize > 800 * 1024) {
          alert('Report file size exceeds the 800KB size limit. Please upload a smaller scan or photo.');
          return;
        }
        setReportAttachment(compressedBase64);
      })
      .catch((err) => {
        console.error('Image compression error:', err);
        alert('Failed to process image. Please try again.');
      });
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTestName || !reportResult) {
      alert('Please fill in required fields (Test Name and Result).');
      return;
    }

    const newReport = {
      id: `rep-${Math.floor(100 + Math.random() * 900)}`,
      date: reportDate,
      testName: reportTestName,
      labName: reportLabName || 'Patient Uploaded',
      result: reportResult,
      notes: reportNotes,
      attachmentUrl: reportAttachment
    };

    const updatedReports = [...(patient.pathologyReports || []), newReport];
    const updatedPatient = {
      ...patient,
      pathologyReports: updatedReports
    };

    onUpdatePatient(updatedPatient);

    // Clear form
    setReportTestName('');
    setReportLabName('');
    setReportResult('');
    setReportDate(new Date().toISOString().split('T')[0]);
    setReportNotes('');
    setReportAttachment(undefined);
    alert('Lab report uploaded successfully!');
  };

  if (activePrintReport) {
    return (
      <div className="patient-portal-layout print-mode" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)', padding: '24px' }}>
        <div className="glass-card prescription-view-card animate-scale-in">
          <div className="rx-watermark" style={{ fontSize: '70px', color: 'hsla(180, 50%, 45%, 0.03)' }}>LAB</div>
          
          <div className="prescription-print-header" style={{ flexDirection: 'column', borderBottom: 'none', marginBottom: '20px', paddingBottom: 0, display: 'flex', gap: '12px' }}>
            <img 
              src="/prescription_header.png" 
              alt="Kamla Devi Hospital Letterhead" 
              style={{ width: '100%', height: 'auto', borderRadius: '4px', display: 'block' }} 
            />
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--border)', paddingBottom: '8px', marginTop: '8px' }}>
                <span className="prescription-print-title" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>PATHOLOGY & LABORATORY REPORT</span>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span><strong>Date:</strong> {formatDateDMY(activePrintReport.date)}</span>
                  <span><strong>Report Ref:</strong> {activePrintReport.id}</span>
                </div>
              </div>
          </div>

          <div className="prescription-patient-info" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '20px' }}>
            <div><strong>Patient Name:</strong> {patient.name}</div>
            <div><strong>Age:</strong> {patient.age} years</div>
            <div><strong>Blood Group:</strong> {patient.bloodGroup}</div>
            <div><strong>Obstetric Score:</strong> G{patient.obstetricHistory.gravidity} P{patient.obstetricHistory.parity} A{patient.obstetricHistory.abortions} L{patient.obstetricHistory.living}</div>
            <div><strong>Allergies:</strong> {patient.allergies.join(', ') || 'NKDA'}</div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>{activePrintReport.testName}</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Laboratory: <strong>{activePrintReport.labName}</strong>
            </span>
          </div>

          <div style={{ background: '#fcfcfc', border: '1px solid #eee', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-light)', display: 'block', marginBottom: '6px' }}>Result / Findings:</strong>
            <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-main)', margin: 0 }}>{activePrintReport.result}</p>
          </div>

          {activePrintReport.notes && (
            <div style={{ marginBottom: '24px' }}>
               <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-light)', display: 'block', marginBottom: '4px' }}>Report Notes:</strong>
               <p style={{ fontSize: '13px', color: 'var(--text-main)', margin: 0, fontStyle: 'italic' }}>{activePrintReport.notes}</p>
            </div>
          )}

          {activePrintReport.attachmentUrl && (
            <div className="no-print" style={{ borderTop: '1px dashed var(--border)', paddingTop: '16px', marginTop: '16px' }}>
              <strong style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-light)', display: 'block', marginBottom: '8px' }}>Report Attachment Preview (Will print on next page):</strong>
              <div style={{ maxWidth: '100%', maxHeight: '400px', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <img src={activePrintReport.attachmentUrl} alt="Report Attachment" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="prescription-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <button 
              onClick={() => window.print()} 
              className="btn btn-primary"
              style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
            >
              <Printer size={16} /> Print Report
            </button>
            <button 
              onClick={() => setActivePrintReport(null)} 
              className="btn btn-secondary"
            >
              Close Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activePrintRx) {
    return (
      <div className="patient-portal-layout print-mode" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)', padding: '24px' }}>
        <div className="glass-card prescription-view-card animate-scale-in">
          <div className="rx-watermark">Rx</div>
          
          <div className="prescription-print-header" style={{ flexDirection: 'column', borderBottom: 'none', marginBottom: '20px', paddingBottom: 0, display: 'flex', gap: '12px' }}>
            <img 
              src="/prescription_header.png" 
              alt="Kamla Devi Hospital Letterhead" 
              style={{ width: '100%', height: 'auto', borderRadius: '4px', display: 'block' }} 
            />
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--border)', paddingBottom: '8px', marginTop: '8px' }}>
                <span className="prescription-print-title" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>PRESCRIPTION CASE CARD</span>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span><strong>Date:</strong> {formatDateDMY(activePrintRx.date)}</span>
                </div>
              </div>
          </div>

          <div className="prescription-patient-info" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '20px' }}>
            <div><strong>Patient Name:</strong> {patient.name}</div>
            <div><strong>Age:</strong> {patient.age} years</div>
            <div><strong>Blood Group:</strong> {patient.bloodGroup}</div>
            <div><strong>Obstetric Score:</strong> G{patient.obstetricHistory.gravidity} P{patient.obstetricHistory.parity} A{patient.obstetricHistory.abortions} L{patient.obstetricHistory.living}</div>
            <div><strong>Allergies:</strong> {patient.allergies.join(', ') || 'NKDA'}</div>
            <div><strong>Doctor:</strong> {activePrintRx.doctorName}</div>
          </div>

          {activePrintRx.vitals && (
            <div className="rx-vitals-block" style={{ background: '#fcfcfc', border: '1px solid #eee', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#555', fontSize: '10px', width: '100%', marginBottom: '2px', borderBottom: '1px dashed #eee', paddingBottom: '2px' }}>Patient Vitals:</span>
              {activePrintRx.vitals.bp && <span><strong>BP:</strong> {activePrintRx.vitals.bp} mmHg</span>}
              {activePrintRx.vitals.pulse !== undefined && <span><strong>Pulse:</strong> {activePrintRx.vitals.pulse} bpm</span>}
              {activePrintRx.vitals.temperature !== undefined && <span><strong>Temp:</strong> {activePrintRx.vitals.temperature} °F</span>}
              {activePrintRx.vitals.height !== undefined && <span><strong>Height:</strong> {activePrintRx.vitals.height} cm</span>}
              {activePrintRx.vitals.weight !== undefined && <span><strong>Weight:</strong> {activePrintRx.vitals.weight} kg</span>}
              {activePrintRx.vitals.bmi !== undefined && <span><strong>BMI:</strong> {activePrintRx.vitals.bmi}</span>}
              {activePrintRx.vitals.spo2 !== undefined && <span><strong>SPO2:</strong> {activePrintRx.vitals.spo2}%</span>}
              {activePrintRx.vitals.lmpDate && <span><strong>LMP:</strong> {activePrintRx.vitals.lmpDate}</span>}
              {activePrintRx.vitals.eddDate && <span><strong>EDD:</strong> {activePrintRx.vitals.eddDate}</span>}
              {activePrintRx.vitals.gestationalAge && <span><strong>Gestation:</strong> {activePrintRx.vitals.gestationalAge}</span>}
            </div>
          )}

          {activePrintRx.symptoms && (
            <div className="rx-symptoms-block" style={{ marginBottom: '16px' }}>
              <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)' }}>Symptoms:</strong>
              <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-main)', marginTop: '4px' }}>{activePrintRx.symptoms}</p>
            </div>
          )}

          <div className="rx-diagnosis-block" style={{ marginBottom: '16px' }}>
            <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)' }}>Diagnosis:</strong>
            <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-main)', marginTop: '4px' }}>{activePrintRx.diagnosis}</p>
          </div>

          {activePrintRx.advice && (
            <div style={{ marginBottom: '20px', borderBottom: '1px dashed var(--border)', paddingBottom: '12px' }}>
              <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)' }}>Advice / General Recommendations:</strong>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: '4px', fontSize: '13px', color: 'var(--text-main)', margin: 0 }}>{activePrintRx.advice}</p>
            </div>
          )}

          <table className="medications-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Medication</th>
                <th style={{ width: '15%' }}>Dosing</th>
                <th style={{ width: '15%' }}>Frequency</th>
                <th style={{ width: '15%' }}>Duration</th>
                <th style={{ width: '25%' }}>Special Instructions</th>
              </tr>
            </thead>
            <tbody>
              {activePrintRx.prescriptions.map((med: any, idx: number) => (
                <tr key={med.id}>
                  <td style={{ fontWeight: 'bold' }}>
                    {idx + 1}. {med.name.toUpperCase()}
                  </td>
                  <td>{med.dosage || '—'}</td>
                  <td>{med.frequency}</td>
                  <td>{med.duration}</td>
                  <td style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)' }}>{med.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {activePrintRx.investigations && (
            <div style={{ marginTop: '20px', borderTop: '1px dashed var(--border)', paddingTop: '12px' }}>
              <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)' }}>Advised Investigations:</strong>
              <p style={{ whiteSpace: 'pre-wrap', marginTop: '4px', fontSize: '13px', color: 'var(--text-main)', margin: 0 }}>{activePrintRx.investigations}</p>
            </div>
          )}

          {activePrintRx.nextAppointment && (
            <div style={{ marginTop: '20px', borderTop: '1px dashed var(--border)', paddingTop: '12px', background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '6px' }}>
              <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)', display: 'block', marginBottom: '6px' }}>Next Scheduled Appointment:</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: '12px', color: 'var(--text-main)' }}>
                <span><strong>Date:</strong> {formatDateDMY(activePrintRx.nextAppointment.date)}</span>
                <span><strong>Time:</strong> {formatTime12h(activePrintRx.nextAppointment.time)}</span>
                <span><strong>Clinic:</strong> {activePrintRx.nextAppointment.clinic}</span>
                {activePrintRx.nextAppointment.doctorName && <span><strong>Doctor:</strong> {activePrintRx.nextAppointment.doctorName}</span>}
                {activePrintRx.nextAppointment.purpose && <span><strong>Purpose:</strong> {activePrintRx.nextAppointment.purpose}</span>}
              </div>
            </div>
          )}

          <div className="prescription-signature" style={{ pageBreakInside: 'avoid' }}>
            <div className="signature-line"></div>
            <p style={{ fontSize: '12px', fontWeight: 600, marginTop: '8px' }}>{activePrintRx.doctorName}</p>
            <p style={{ fontSize: '11px', color: '#0056b3', fontWeight: 500, marginTop: '4px', lineHeight: 1.4 }}>
              MBBS, MD (Obs & Gyn)<br />
              Regd no. 36782
            </p>
          </div>

          <div className="prescription-actions" style={{ display: 'flex', gap: '12px', marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button 
              onClick={() => window.print()} 
              className="btn btn-primary"
            >
              <Printer size={14} /> Print / Export PDF
            </button>
            <button 
              onClick={() => setActivePrintRx(null)} 
              className="btn btn-secondary"
            >
              Close Print Preview
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)' }}>
      {/* Top Navbar */}
      <nav style={{
        background: 'var(--bg-card-solid)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px var(--primary-light)'
          }}>
            <Heart size={18} fill="white" style={{ color: 'white' }} />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '16px', display: 'block' }}>Patient Portal</span>
            <span style={{ fontSize: '10px', color: 'var(--text-light)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Kamla Devi Hospital
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a 
            href="https://wa.me/917007973087" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn" 
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
              display: 'flex', 
              gap: '6px', 
              alignItems: 'center', 
              background: 'hsl(142, 70%, 45%)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: 600, 
              textDecoration: 'none', 
              boxShadow: '0 2px 6px hsla(142, 70%, 45%, 0.2)'
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12.031 2c-5.516 0-9.986 4.47-9.986 9.987 0 1.963.57 3.79 1.547 5.342l-1.592 5.82 5.962-1.563a9.92 9.92 0 0 0 4.069.878c5.516 0 9.987-4.47 9.987-9.986C22.018 6.47 17.547 2 12.03 2zm6.29 13.916c-.253.712-1.464 1.307-2.01 1.353-.5.042-1.14.074-3.26-.803-2.71-1.118-4.43-3.87-4.565-4.053-.13-.183-1.097-1.458-1.097-2.782 0-1.324.693-1.977.94-2.233.25-.256.544-.32.727-.32a.72.72 0 0 1 .525.24c.2.257.693 1.688.75 1.81.06.12.1.26.02.42-.08.16-.16.26-.26.38a19.16 19.16 0 0 0-.29.35c-.11.12-.22.25-.1.46.12.2.53.88 1.14 1.43.79.7 1.45 1.18 1.66 1.28.21.1.33.08.46-.06.13-.14.54-.63.69-.85.14-.21.29-.18.49-.1.2.08 1.26.6 1.48.71.21.1.36.16.41.25.05.09.05.53-.2 1.24z"/>
            </svg>
            Chat on WhatsApp
          </a>
          <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </nav>

      {/* Main Layout Container */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
        {/* Welcome Section */}
        <div className="glass-card animate-scale-in" style={{ padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>Hello, {patient.name}</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '2px' }}>
                Medical ID: <strong style={{ fontFamily: 'monospace' }}>{patient.id}</strong> • Primary Clinic: <strong>{patient.clinic}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className={`badge ${patient.status.toLowerCase()}`} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '20px', fontWeight: 600 }}>
                {patient.status} Care
              </span>
            </div>
          </div>

          {/* Quick Demographics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-light)', fontSize: '11px', display: 'block', marginBottom: '2px' }}>Age / Blood Group</span>
              <strong style={{ fontSize: '15px' }}>{patient.age} yrs • {patient.bloodGroup}</strong>
            </div>
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-light)', fontSize: '11px', display: 'block', marginBottom: '2px' }}>Obstetric Score</span>
              <strong style={{ fontSize: '15px' }}>
                G{patient.obstetricHistory.gravidity} P{patient.obstetricHistory.parity} A{patient.obstetricHistory.abortions} L{patient.obstetricHistory.living}
              </strong>
            </div>
            {patient.status === 'Prenatal' && patient.maternityRecord?.eddDate && (
              <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-light)', fontSize: '11px', display: 'block', marginBottom: '2px' }}>Estimated Delivery (EDD)</span>
                <strong style={{ fontSize: '15px', color: 'var(--primary)' }}>{patient.maternityRecord.eddDate}</strong>
              </div>
            )}
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-light)', fontSize: '11px', display: 'block', marginBottom: '2px' }}>Allergies</span>
              <strong style={{ fontSize: '13px', color: patient.allergies && patient.allergies.length > 0 ? 'hsl(0, 75%, 55%)' : 'var(--text-muted)' }}>
                {patient.allergies?.join(', ') || 'None Known'}
              </strong>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', marginBottom: '24px', overflowX: 'auto' }}>
          <button
            onClick={() => setActivePortalTab('timeline')}
            className={`detail-tab ${activePortalTab === 'timeline' ? 'active' : ''}`}
            style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 16px', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
          >
            <Activity size={16} /> My Treatment Timeline
          </button>
          <button
            onClick={() => setActivePortalTab('medications')}
            className={`detail-tab ${activePortalTab === 'medications' ? 'active' : ''}`}
            style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 16px', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
          >
            <Pill size={16} /> My Prescriptions
          </button>
          <button
            onClick={() => setActivePortalTab('appointments')}
            className={`detail-tab ${activePortalTab === 'appointments' ? 'active' : ''}`}
            style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 16px', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
          >
            <Calendar size={16} /> My Appointments ({myAppointments.length})
          </button>
          <button
            onClick={() => setActivePortalTab('reports')}
            className={`detail-tab ${activePortalTab === 'reports' ? 'active' : ''}`}
            style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 16px', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}
          >
            <Clipboard size={16} /> Pathology & Ultrasound Reports ({patient.pathologyReports?.length || 0})
          </button>
        </div>

        {/* Tab Panels */}
        {activePortalTab === 'timeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Maternity Vitals Log if Prenatal */}
            {patient.status === 'Prenatal' && patient.maternityRecord && patient.maternityRecord.prenatalVitals && patient.maternityRecord.prenatalVitals.length > 0 && (
              <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} style={{ color: 'var(--primary)' }} /> Prenatal Checkup Logs
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto' }}>
                  {patient.maternityRecord.prenatalVitals.map((v) => (
                    <div key={v.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span>Gestation: {v.gestationalAge}</span>
                        <span style={{ color: 'var(--text-light)', fontSize: '12px' }}>{formatDateDMY(v.date)}</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                        BP: {v.systolicBP}/{v.diastolicBP} mmHg • Weight: {v.weightKg} kg • HR: {v.heartRate} bpm
                        {v.fetalHeartRateBpm && ` • Fetal Heart Rate: ${v.fetalHeartRateBpm} bpm`}
                      </div>
                      {v.notes && <div style={{ fontStyle: 'italic', fontSize: '11px', marginTop: '6px', color: 'var(--text-light)', borderLeft: '2px solid var(--border)', paddingLeft: '8px' }}>"{v.notes}"</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Consultations Log */}
            <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clipboard size={18} style={{ color: 'var(--primary)' }} /> Clinical Consultations Timeline
              </h3>
              {!patient.consultations || patient.consultations.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No consultations logged yet.</p>
              ) : (
                <div className="timeline">
                  {patient.consultations.map((con) => (
                    <div key={con.id} className="timeline-node">
                      <div className="timeline-dot"></div>
                      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '16px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 600 }}>{con.doctorName}</span>
                          <span style={{ color: 'var(--text-light)', fontSize: '12px' }}>{formatDateDMY(con.date)}</span>
                        </div>
                        {con.symptoms && (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            <strong>Symptoms:</strong> {con.symptoms}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', marginTop: '4px' }}>
                          <strong>Diagnosis:</strong> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{con.diagnosis}</span>
                        </div>
                        {con.notes && (
                          <div style={{ fontSize: '13px', marginTop: '8px', color: 'var(--text-main)' }}>
                            <strong>Notes:</strong> {con.notes}
                          </div>
                        )}
                        {con.investigations && (
                          <div style={{ fontSize: '13px', marginTop: '8px', color: 'var(--text-main)' }}>
                            <strong>Advised Investigations:</strong> <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>{con.investigations}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activePortalTab === 'medications' && (
          <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
            {rxConsultations.length === 0 ? (
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pill size={18} style={{ color: 'var(--primary)' }} /> Active Prescriptions
                </h3>
                <p style={{ color: 'var(--text-light)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No active medications prescribed.</p>
              </>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Pill size={18} style={{ color: 'var(--primary)' }} /> Active Prescriptions (from {rxConsultations[0].date})
                  </h3>
                  <button 
                    onClick={() => setActivePrintRx(rxConsultations[0])} 
                    className="btn btn-primary"
                    style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 14px', fontSize: '13px' }}
                  >
                    <Printer size={14} /> Print / Download PDF
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {rxConsultations[0].prescriptions.map((med) => (
                    <div key={med.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '16px', borderRadius: '10px' }}>
                      <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '8px' }}>{med.name.toUpperCase()}</h4>
                      <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-main)' }}>
                        <div><strong>Frequency:</strong> {med.frequency}</div>
                        <div><strong>Duration:</strong> {med.duration}</div>
                        {med.notes && (
                          <div style={{
                            background: 'var(--bg-card-solid)',
                            border: '1px solid var(--border)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontStyle: 'italic',
                            color: 'var(--text-light)',
                            marginTop: '6px'
                          }}>
                            Note: {med.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {rxConsultations.length > 1 && (
                  <div style={{ marginTop: '28px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-light)' }}>
                      Prescription History
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {rxConsultations.slice(1).map((con) => (
                        <div key={con.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '10px', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>Prescription Case Card</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Date: {formatDateDMY(con.date)} • Doctor: {con.doctorName} • Diagnosis: {con.diagnosis}
                            </div>
                          </div>
                          <button 
                            onClick={() => setActivePrintRx(con)} 
                            className="btn btn-secondary"
                            style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '5px 12px', fontSize: '12px' }}
                          >
                            <Printer size={12} /> Format & Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activePortalTab === 'appointments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Reminder Options Card */}
            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Bell size={20} style={{ color: 'var(--primary)' }} />
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '14px' }}>Appointment Reminders</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-light)' }}>Receive notifications and reminders directly in your browser.</p>
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={remindersEnabled}
                  onChange={requestBrowserNotificationPermission}
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: 'var(--primary)',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Enable App Alerts</span>
              </label>
            </div>

            {/* Appointments list */}
            <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Calendar size={18} style={{ color: 'var(--primary)' }} /> Upcoming Scheduled Visits
                </h3>
                <a 
                  href="https://wa.me/917007973087" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn" 
                  style={{ 
                    padding: '6px 14px', 
                    fontSize: '13px', 
                    display: 'flex', 
                    gap: '8px', 
                    alignItems: 'center', 
                    background: 'hsl(142, 70%, 45%)', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px', 
                    fontWeight: 600, 
                    textDecoration: 'none', 
                    boxShadow: '0 2px 8px hsla(142, 70%, 45%, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12.031 2c-5.516 0-9.986 4.47-9.986 9.987 0 1.963.57 3.79 1.547 5.342l-1.592 5.82 5.962-1.563a9.92 9.92 0 0 0 4.069.878c5.516 0 9.987-4.47 9.987-9.986C22.018 6.47 17.547 2 12.03 2zm6.29 13.916c-.253.712-1.464 1.307-2.01 1.353-.5.042-1.14.074-3.26-.803-2.71-1.118-4.43-3.87-4.565-4.053-.13-.183-1.097-1.458-1.097-2.782 0-1.324.693-1.977.94-2.233.25-.256.544-.32.727-.32a.72.72 0 0 1 .525.24c.2.257.693 1.688.75 1.81.06.12.1.26.02.42-.08.16-.16.26-.26.38a19.16 19.16 0 0 0-.29.35c-.11.12-.22.25-.1.46.12.2.53.88 1.14 1.43.79.7 1.45 1.18 1.66 1.28.21.1.33.08.46-.06.13-.14.54-.63.69-.85.14-.21.29-.18.49-.1.2.08 1.26.6 1.48.71.21.1.36.16.41.25.05.09.05.53-.2 1.24z"/>
                  </svg>
                  Book Appointment via WhatsApp
                </a>
              </div>
              {myAppointments.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No upcoming appointments scheduled.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {myAppointments.map((app) => (
                    <div key={app.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                      padding: '16px',
                      borderRadius: '10px',
                      flexWrap: 'wrap',
                      gap: '16px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '4px 8px',
                            background: app.status === 'Scheduled' ? 'var(--primary-light)' : 'var(--bg-card-solid)',
                            color: app.status === 'Scheduled' ? 'var(--primary)' : 'var(--text-light)',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '4px'
                          }}>
                            {app.status}
                          </span>
                          <strong style={{ fontSize: '15px' }}>{app.purpose}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: '14px', color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Calendar size={12} /> {formatDateDMY(app.date)} ({getDayName(app.date)})
                          </span>
                          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Clock size={12} /> {formatTime12h(app.time)}
                          </span>
                          <span>Doctor: {app.doctorName}</span>
                          <span>Location: {app.clinic === 'Kamla Devi Hospital' ? 'KDH' : 'TSF'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => downloadIcsFile(app)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}
                      >
                        <Download size={12} /> Sync Calendar (.ics)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activePortalTab === 'reports' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
            {/* Left Side: Pathology Report History */}
            <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clipboard size={18} style={{ color: 'var(--primary)' }} /> Pathology & Ultrasound Reports History
              </h3>
              
              {!patient.pathologyReports || patient.pathologyReports.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                  No pathology or ultrasound reports recorded yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {patient.pathologyReports.map((report) => (
                    <div 
                      key={report.id} 
                      style={{ 
                        background: 'var(--bg-app)', 
                        border: '1px solid var(--border)', 
                        padding: '16px', 
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{report.testName}</h4>
                          <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                            Laboratory: <strong>{report.labName}</strong>
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', background: 'var(--bg-card-solid)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
                          {formatDateDMY(report.date)}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', marginTop: '6px' }}>
                        <strong style={{ color: 'var(--text-muted)' }}>Result / Finding:</strong>
                        <span style={{ marginLeft: '6px', fontWeight: 600, color: 'var(--text-main)' }}>{report.result}</span>
                      </div>

                      {report.notes && (
                        <p style={{ fontSize: '12px', color: 'var(--text-light)', margin: '8px 0 0 0', fontStyle: 'italic' }}>
                          Notes: {report.notes}
                        </p>
                      )}

                      <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border)', paddingTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <button 
                          onClick={() => setActivePrintReport(report)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', gap: '4px', alignItems: 'center' }}
                        >
                          <Printer size={12} /> Print Report Summary
                        </button>

                        {report.attachmentUrl && (
                          <>
                            <button 
                              onClick={() => setActivePreviewReportAttachment(report.attachmentUrl || null)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', gap: '4px', alignItems: 'center' }}
                            >
                              <ImageIcon size={12} /> Preview Attachment
                            </button>
                            <a 
                              href={report.attachmentUrl} 
                              download={`report-${report.testName.replace(/\s+/g, '-')}-${report.date}.jpg`}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', gap: '4px', alignItems: 'center', textDecoration: 'none' }}
                            >
                              <Download size={12} /> Download Attachment
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Side: Upload Pathology Report */}
            <div className="glass-card" style={{ height: 'fit-content', padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Upload Pathology & Ultrasound Report</h3>
              <form onSubmit={handleReportSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Test Name *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. AMH, Thyroid, CBC" 
                      className="form-control" 
                      value={reportTestName}
                      onChange={e => setReportTestName(e.target.value)}
                      style={{ height: '34px', fontSize: '13px' }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Lab / Clinic Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Kamla Devi Diagnostic Centre" 
                      className="form-control" 
                      value={reportLabName}
                      onChange={e => setReportLabName(e.target.value)}
                      style={{ height: '34px', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Report Date *</label>
                      <input 
                        type="date" 
                        required
                        className="form-control" 
                        value={reportDate}
                        onChange={e => setReportDate(e.target.value)}
                        style={{ height: '34px', fontSize: '13px' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px' }}>Result Value *</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. 1.8 ng/mL" 
                        className="form-control" 
                        value={reportResult}
                        onChange={e => setReportResult(e.target.value)}
                        style={{ height: '34px', fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '12px' }}>Notes / Remarks</label>
                    <textarea 
                      placeholder="Symptoms or details mentioned in the report..." 
                      className="form-control" 
                      rows={2}
                      value={reportNotes}
                      onChange={e => setReportNotes(e.target.value)}
                      style={{ fontSize: '13px' }}
                    />
                  </div>

                  {/* Scan attachment upload */}
                  <div style={{ border: '1px dashed var(--border)', padding: '10px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-light)' }}>
                      Report Scans/Photos
                    </span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleReportFileChange} 
                      style={{ display: 'none' }} 
                      id="portal-report-file-input"
                    />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label htmlFor="portal-report-file-input" className="btn btn-secondary" style={{ cursor: 'pointer', display: 'flex', gap: '4px', alignItems: 'center', margin: 0, padding: '4px 8px', fontSize: '11px' }}>
                        <Camera size={12} /> Select Photo
                      </label>
                      <span style={{ fontSize: '11px', color: 'var(--text-light)' }}>
                        {reportAttachment ? 'Scan selected' : 'No scan attached'}
                      </span>
                    </div>

                    {reportAttachment && (
                      <div style={{ marginTop: '8px', position: 'relative', width: '60px', height: '60px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={reportAttachment} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button 
                          type="button" 
                          onClick={() => setReportAttachment(undefined)} 
                          style={{ position: 'absolute', top: '1px', right: '1px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <Trash2 size={8} />
                        </button>
                      </div>
                    )}
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', padding: '8px', fontSize: '13px' }}>
                    Upload & Save Report
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Attachment Preview Modal Overlay */}
      {activePreviewReportAttachment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}>
          <div className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: '700px', background: 'var(--bg-card-solid)', position: 'relative', padding: '20px', borderRadius: '16px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Report Attachment Preview</h4>
            <div style={{ width: '100%', maxHeight: '500px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-app)' }}>
              <img src={activePreviewReportAttachment} alt="Pathology Report Attachment" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={() => setActivePreviewReportAttachment(null)}
                className="btn btn-secondary"
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
