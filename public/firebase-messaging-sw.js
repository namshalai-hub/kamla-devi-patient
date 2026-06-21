// Import the scripts needed
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// the app's Firebase config object
firebase.initializeApp({
  apiKey: "AIzaSyAVd9sdPgKaKsyuao3f_r7fNcxH0rIdJT8",
  authDomain: "kamla-devi-crm-ac742.firebaseapp.com",
  projectId: "kamla-devi-crm-ac742",
  storageBucket: "kamla-devi-crm-ac742.firebasestorage.app",
  messagingSenderId: "629736142879",
  appId: "1:629736142879:web:314204e897541f4103bd2a",
  measurementId: "G-XNMMHRRPZ4"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Kamla Devi Hospital';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/favicon.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
