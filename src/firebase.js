// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDccDnxKrGeZtHWFLcpPyAn49RZ8J07krE",
  authDomain: "vdb-entrepreneurs.firebaseapp.com",
  projectId: "vdb-entrepreneurs",
  storageBucket: "vdb-entrepreneurs.firebasestorage.app",
  messagingSenderId: "471668083493",
  appId: "1:471668083493:web:cb064194b680ce5962e8cc",
  measurementId: "G-79LBFMVLDK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export commonly used services so they can be imported in other files
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Firebase persistence error:", err.code);
});

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
