import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AQ.Ab8RN6JzVmcnc5xH6rgir-phbk9MwGw0aaPS8wV5uErc3cOOIg",
  authDomain: "radar-ai-ab2f6.firebaseapp.com",
  projectId: "radar-ai-ab2f6",
  storageBucket: "radar-ai-ab2f6.firebasestorage.app",
  messagingSenderId: "699144746563",
  appId: "1:699144746563:web:a1798c1eb225726184c6f6",
  measurementId: "G-01T5WHF3HM"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { GoogleAuthProvider, signInWithPopup, signOut };