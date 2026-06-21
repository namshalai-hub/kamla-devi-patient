import React, { useState } from 'react';
import type { Patient, Appointment, ConsultationRecord } from '../types/crm';
import { LogOut, Heart, Calendar, Clock, Clipboard, Pill, Download, Bell, Activity, Camera, Image as ImageIcon, Trash2, Printer } from 'lucide-react';

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

  // Form State for Lab Report upload inside portal
  const [reportTestName, setReportTestName] = useState('');
  const [reportLabName, setReportLabName] = useState('');
  const [reportResult, setReportResult] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportNotes, setReportNotes] = useState('');
  const [reportAttachment, setReportAttachment] = useState<string | undefined>(undefined);
  const [activePreviewReportAttachment, setActivePreviewReportAttachment] = useState<string | null>(null);

  const [activePrintRx, setActivePrintRx] = useState<ConsultationRecord | null>(null);

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
      setRemindersEnabled(!remindersEnabled);
      alert('Reminders are active! We will send you notification alerts before your sessions.');
    } else {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setRemindersEnabled(true);
          new Notification('Reminders Enabled', {
            body: 'You will receive appointment updates and notifications here.',
            icon: '/favicon.ico'
          });
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

    compressImage(file)
      .then((compressedBase64) => {
        const approximateSize = (compressedBase64.length * 3) / 4;
        if (approximateSize > 2 * 1024 * 1024) {
          alert('Compressed image exceeds the 2MB size limit. Please select a smaller photo.');
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

  if (activePrintRx) {
    return (
      <div className="patient-portal-layout print-mode" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)', padding: '24px' }}>
        <div className="glass-card prescription-view-card animate-scale-in">
          <div className="rx-watermark">Rx</div>
          
          <div className="prescription-print-header" style={{ flexDirection: 'column', borderBottom: 'none', marginBottom: '20px', paddingBottom: 0, display: 'flex', gap: '12px' }}>
            {/* Hardcoded header details for letterhead styling if no image banner */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--primary)', paddingBottom: '12px', marginBottom: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>Kamla Devi Hospital</h1>
              <p style={{ fontSize: '11px', color: 'var(--text-light)', margin: '2px 0 0 0', textTransform: 'uppercase', letterSpacing: '1px' }}>EMR & Fertility Portal</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--border)', paddingBottom: '8px', marginTop: '8px' }}>
              <span className="prescription-print-title" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>PRESCRIPTION CASE CARD</span>
              <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span><strong>Date:</strong> {activePrintRx.date}</span>
                <span><strong>Rx Ref:</strong> {activePrintRx.id}</span>
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

          <div className="rx-diagnosis-block" style={{ marginBottom: '16px' }}>
            <strong style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-light)' }}>Primary Diagnosis:</strong>
            <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-main)', marginTop: '4px' }}>{activePrintRx.diagnosis}</p>
          </div>

          <table className="medications-table">
            <thead>
              <tr>
                <th>Medication / Formula</th>
                <th>Frequency</th>
                <th>Duration</th>
                <th>Special Instructions</th>
              </tr>
            </thead>
            <tbody>
              {activePrintRx.prescriptions.map((med: any) => (
                <tr key={med.id}>
                  <td style={{ fontWeight: 'bold' }}>
                    {med.name}
                    {med.dosage ? ` (${med.dosage})` : ''}
                  </td>
                  <td>{med.frequency}</td>
                  <td>{med.duration}</td>
                  <td style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)' }}>{med.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="prescription-signature" style={{ pageBreakInside: 'avoid' }}>
            <div className="signature-line"></div>
            <p style={{ fontSize: '12px', fontWeight: 600, marginTop: '8px' }}>{activePrintRx.doctorName}</p>
            <p style={{ fontSize: '10px', color: 'var(--text-light)' }}>Licensed Obstetrician / Gynecologist</p>
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

        <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <LogOut size={14} /> Log Out
        </button>
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
            {patient.maternityRecord?.eddDate && (
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
            <Clipboard size={16} /> My Lab Reports ({patient.pathologyReports?.length || 0})
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
                        <span style={{ color: 'var(--text-light)', fontSize: '12px' }}>{v.date}</span>
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
                          <span style={{ color: 'var(--text-light)', fontSize: '12px' }}>{con.date}</span>
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
                      <h4 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '8px' }}>{med.name}</h4>
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
                              Date: {con.date} • Doctor: {con.doctorName} • Diagnosis: {con.diagnosis}
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
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: 'var(--primary)' }} /> Upcoming Scheduled Visits
              </h3>
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
                        <div style={{ display: 'flex', gap: '14px', color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>
                          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Calendar size={12} /> {app.date}
                          </span>
                          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <Clock size={12} /> {app.time}
                          </span>
                          <span>Doctor: {app.doctorName}</span>
                          <span>Location: {app.clinic}</span>
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
                <Clipboard size={18} style={{ color: 'var(--primary)' }} /> Lab & Pathology Reports History
              </h3>
              
              {!patient.pathologyReports || patient.pathologyReports.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                  No lab or pathology reports recorded yet.
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
                          {report.date}
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

                      {report.attachmentUrl && (
                        <div style={{ marginTop: '10px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                          <button 
                            onClick={() => setActivePreviewReportAttachment(report.attachmentUrl || null)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', gap: '4px', alignItems: 'center' }}
                          >
                            <ImageIcon size={12} /> Preview Report Attachment
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Side: Upload Pathology Report */}
            <div className="glass-card" style={{ height: 'fit-content', padding: '20px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Upload Scanned Report</h3>
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
