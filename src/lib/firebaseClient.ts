import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken } from 'firebase/messaging';

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

export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export const requestForToken = async () => {
  if (!messaging) return null;
  try {
    const currentToken = await getToken(messaging, {
      vapidKey: 'BHoyuW_940RUj-mI-Q130IgE0shJTKRcJtlxe7Hu5T6g7bByBM5oAUl2v3mhFEtc-3h1OahoctI9ZjRSmCVsX08'
    });
    if (currentToken) {
      console.log('FCM token:', currentToken);
      return currentToken;
    }
    return null;
  } catch (err) {
    console.error('An error occurred while retrieving token.', err);
    return null;
  }
};
