// Configuración COMPLETA de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, ref, set, get, update, remove, onValue, push, 
    query, orderByChild, equalTo, onDisconnect, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
    getAuth, signInAnonymously, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getStorage, ref as storageRef, uploadBytes, 
    uploadBytesResumable, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { 
    getMessaging, getToken, onMessage 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

// Configuración REAL de TU Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBOUZNcnwo3RiR8Qcol9TayH6slTHkTpLE",
    authDomain: "red-social-joinpeople.firebaseapp.com",
    projectId: "red-social-joinpeople",
    storageBucket: "red-social-joinpeople.firebasestorage.app",
    messagingSenderId: "829904738039",
    appId: "1:829904738039:web:f19945cd61c53154eaa5f2",
    measurementId: "G-6RVRK610Z6"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
const messaging = getMessaging(app);

export {
    app, database, auth, storage, messaging,
    ref, set, get, update, remove, onValue, push, query, 
    orderByChild, equalTo, onDisconnect, serverTimestamp,
    signInAnonymously, onAuthStateChanged, signOut,
    storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject,
    getToken, onMessage
};