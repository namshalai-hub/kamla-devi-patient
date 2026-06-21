import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAVd9sdPgKaKsyuao3f_r7fNcxH0rIdJT8",
  authDomain: "kamla-devi-crm-ac742.firebaseapp.com",
  projectId: "kamla-devi-crm-ac742",
  storageBucket: "kamla-devi-crm-ac742.firebasestorage.app",
  messagingSenderId: "629736142879",
  appId: "1:629736142879:web:314204e897541f4103bd2a",
  measurementId: "G-XNMMHRRPZ4"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
