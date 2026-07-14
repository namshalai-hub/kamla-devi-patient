export type PatientStatus = 'IVF' | 'IUI' | 'Prenatal' | 'Postpartum' | 'Pre-conception' | 'Gynecological' | 'General Medicine' | 'Vaccination' | 'Inactive';

export interface ObstetricHistory {
  gravidity: number; // Total pregnancies
  parity: number;    // Deliveries > 20 weeks
  abortions: number; // Miscarriages/terminations
  living: number;    // Living children
}

export interface StimulationFollicleLogEntry {
  day: number;
  date: string;
  leftOvaryFollicles: number[];  // Sizes in mm (e.g. [12, 14, 15])
  rightOvaryFollicles: number[]; // Sizes in mm (e.g. [10, 11, 15, 17])
  estradiol: number;   // pg/mL
  progesterone: number; // ng/mL
  lh: number;           // mIU/mL
  fshDose?: number;     // FSH given (IU)
  hmgDose?: number;     // HMG given (IU)
  endometrialThickness?: number; // ET in mm for FET
  estrogenDose?: string;         // Estrogen medication dosage for FET
  notes?: string;
}

export interface IVFRetrievalLog {
  date: string;
  eggsRetrieved: number;
  matureEggs: number;
  notes: string;
}

export interface IVFFertilizationLog {
  date: string;
  method: 'IVF' | 'ICSI' | 'Mixed';
  fertilizedCount: number;
  embryosDay3: number;
  embryosDay5: number;
  details: string;
  embryoImages?: string[]; // Base64 data URLs of embryo photographs
}

export interface IVFTransferLog {
  date: string;
  embryosTransferredCount: number;
  stage: 'Day 3' | 'Day 5';
  quality: string; // e.g. "4AA, 4AB"
  betaHcgResults: {
    test1Date: string;
    test1Value: number;
    test2Date: string;
    test2Value: number;
    outcome: 'Positive' | 'Negative' | 'Chemical' | 'Pending';
  } | null;
}

export interface IVFCycleLog {
  id: string;
  cycleStartDate: string;
  lmpDate?: string; // Last Menstrual Period Date
  protocol: string; // e.g. 'Antagonist', 'Long Agonist', 'Mild Stimulation'
  status: 'Stimulation' | 'Retrieval' | 'Culture' | 'Freezing' | 'Transfer' | 'Completed' | 'Cancelled';
  stimulationDays: StimulationFollicleLogEntry[];
  retrieval: IVFRetrievalLog | null;
  fertilization: IVFFertilizationLog | null;
  freezing: IVFFreezingLog | null;
  transfer: IVFTransferLog | null;
  notes: string;
  amh?: number;
  afc?: number;
}

export interface IUICycleLog {
  id: string;
  cycleStartDate: string;
  protocol: string; // e.g. 'Natural', 'Letrozole', 'Clomiphene Citrate', 'Gonadotropins'
  status: 'Monitoring' | 'Trigger' | 'Insemination' | 'Completed' | 'Cancelled';
  monitoringDays: StimulationFollicleLogEntry[];
  trigger: {
    date: string;
    time: string;
    medication: string;
  } | null;
  insemination: {
    date: string;
    time: string;
    postWashCount: number; // Million/mL
    postWashMotility: number; // %
    notes: string;
  } | null;
  notes: string;
}

export interface TrimesterChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface TrimesterChecklist {
  firstTrimester: TrimesterChecklistItem[];
  secondTrimester: TrimesterChecklistItem[];
  thirdTrimester: TrimesterChecklistItem[];
}

export interface PrenatalVitalEntry {
  id: string;
  date: string;
  gestationalAge: string; // e.g. "12w 3d"
  weightKg: number;
  systolicBP: number;
  diastolicBP: number;
  heartRate: number;
  fetalHeartRateBpm: number | null; // beats per minute
  notes: string;
  consultationId?: string; // Links to a consultation record
}

export interface MaternityRecord {
  id: string;
  lmpDate: string;  // Last Menstrual Period
  eddDate: string;  // Calculated Estimated Date of Delivery
  isHighRisk: boolean;
  highRiskReasons: string[];
  trimesterChecklist: TrimesterChecklist;
  prenatalVitals: PrenatalVitalEntry[];
  status: 'Active' | 'Completed' | 'Cancelled';
  notes?: string;
}

export interface PrescriptionItem {
  id: string;
  name: string;
  dosage?: string;   // e.g. "200mg"
  frequency: string; // e.g. "Twice daily"
  duration: string;  // e.g. "14 days"
  notes: string;     // e.g. "Take after food"
}

export interface VisitVitals {
  bp?: string;          // e.g. "120/80"
  pulse?: number;       // bpm
  temperature?: number; // °F
  height?: number;      // cm
  weight?: number;      // kg
  bmi?: number;         // calculated
  spo2?: number;        // %
  lmpDate?: string;     // Last Menstrual Period Date
  eddDate?: string;     // Calculated EDD
  gestationalAge?: string; // Gestational Age progression
  fetalHeartRate?: number; // FHR in bpm for prenatal visits
}

export interface ConsultationRecord {
  id: string;
  date: string;
  doctorName: string;
  symptoms: string;
  diagnosis: string;
  notes: string;
  vitals?: VisitVitals;
  prescriptions: PrescriptionItem[];
  investigations?: string;
  nextAppointment?: {
    date: string;
    time: string;
    clinic: string;
    doctorName: string;
    purpose: string;
  };
  advice?: string;
}

export interface PathologyReport {
  id: string;
  date: string;
  testName: string;
  labName: string;
  result: string;
  notes: string;
  attachmentUrl?: string; // Base64 data URL for report photo/pdf
}

export interface PatientProcedure {
  id: string;
  date: string;
  name: string;          // e.g. "Diagnostic Hysteroscopy", "Cyst Aspiration"
  doctorName: string;    // e.g. "Dr. Namita Chandra"
  indication: string;    // e.g. "Subseptate uterus"
  findings: string;      // e.g. "Polyp resected"
  notes: string;         // e.g. "Stable post-op"
  attachmentUrl?: string; // Base64 data URL for procedural scans, photos (backward compatibility)
  attachmentUrls?: string[]; // Up to 4 base64 images
}

export interface Patient {
  id: string;
  name: string;
  dob: string;
  age: number;
  partnerName: string;
  contactNumber: string;
  email: string;
  bloodGroup: string;
  status: PatientStatus;
  chronicConditions: string[];
  allergies: string[];
  notes: string;
  obstetricHistory: ObstetricHistory;
  ivfCycles: IVFCycleLog[];
  iuiCycles: IUICycleLog[];
  maternityRecord: MaternityRecord | null;
  maternityRecords?: MaternityRecord[];
  consultations: ConsultationRecord[];
  pathologyReports?: PathologyReport[];
  procedures?: PatientProcedure[];
  preconceptionChecklist?: PreconceptionChecklist;
  clinic: 'Kamla Devi Hospital' | 'T.S. Mishra Fertility Centre';
  appointments?: Appointment[];
  googleDriveFolderUrl?: string;
}

export interface PreconceptionChecklistItem {
  id: string;
  category: 'Female' | 'Male' | 'General';
  label: string;
  status: 'Not Done' | 'Ordered' | 'Normal' | 'Abnormal';
  resultValue?: string;
  notes?: string;
  date?: string; // Date of test/investigation
  updatedAt?: string;
}

export interface PreconceptionChecklist {
  items: PreconceptionChecklistItem[];
  husbandEvaluated?: boolean;
  notes?: string;
  partnerPrescription?: PrescriptionItem[];
}

export interface IVFFreezingLog {
  date: string;
  embryosFrozenCount: number;
  stage: 'Day 3' | 'Day 5' | 'Day 6';
  quality: string;
  strawNumbers: string; // e.g. "Straw 1, Straw 2"
  notes: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  clinic: 'Kamla Devi Hospital' | 'T.S. Mishra Fertility Centre';
  doctorName: string;
  purpose: string; // e.g. "Follicle Scan", "IUI", "Prenatal Check"
  status: 'Scheduled' | 'Checked-in' | 'Completed' | 'Cancelled';
  remindersEnabled: boolean;
}

export type UserRole = 'Doctor' | 'Receptionist' | 'Patient';
