// Archivo necesario para Firebase Messaging (Service Worker)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBOUZNcnwo3RiR8Qcol9TayH6slTHkTpLE",
    authDomain: "red-social-joinpeople.firebaseapp.com",
    projectId: "red-social-joinpeople",
    storageBucket: "red-social-joinpeople.firebasestorage.app",
    messagingSenderId: "829904738039",
    appId: "1:829904738039:web:f19945cd61c53154eaa5f2",
    measurementId: "G-6RVRK610Z6"
};

// Inicializar Firebase en el Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Manejar mensajes en segundo plano
messaging.onBackgroundMessage((payload) => {
    console.log('Mensaje en segundo plano:', payload);
    
    const notificationTitle = payload.notification?.title || 'Vibra Chat';
    const notificationOptions = {
        body: payload.notification?.body || 'Nuevo mensaje',
        icon: '/icons/vibra-192.png',
        badge: '/icons/vibra-192.png',
        data: payload.data || {}
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});