
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCswQbdKCqpzixRq8ABviTer35KaZsIY14",
  authDomain: "gestor-financeiro-wxzkm.firebaseapp.com",
  projectId: "gestor-financeiro-wxzkm",
  storageBucket: "gestor-financeiro-wxzkm.firebasestorage.app",
  messagingSenderId: "868312843488",
  appId: "1:868312843488:web:22db1ab0a27ace2fbd7c85"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
try {
    enableIndexedDbPersistence(db);
} catch (err) {
    if (err instanceof Error && err.code === 'failed-precondition') {
        console.warn("Firestore offline persistence could not be enabled: multiple tabs open.");
    } else if (err instanceof Error && err.code === 'unimplemented') {
        console.warn("Firestore offline persistence is not available in this browser.");
    }
}


const auth = getAuth(app, {
  authDomain: firebaseConfig.authDomain,
});


export { app, db, auth };
