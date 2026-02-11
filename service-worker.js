const CACHE_NAME = 'vibra-chat-v3.2';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/firebase-config.js',
    '/upload-handler.js',
    '/notification-service.js',
    '/icons/vibra-192.png',
    '/icons/vibra-512.png',
    '/audio/message-sent.mp3',
    '/audio/message-received.mp3',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@400;500;700&display=swap',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js'
];

// Instalar
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache abierto');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activar
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Estrategia Cache First con Network Fallback
self.addEventListener('fetch', event => {
    // Ignorar solicitudes de Firebase y Monetag
    if (event.request.url.includes('firebase') || 
        event.request.url.includes('monetag') ||
        event.request.url.includes('omg10.com')) {
        return;
    }
    
    // Para navegación, servir index.html
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('/index.html').then(response => {
                return response || fetch(event.request);
            })
        );
        return;
    }
    
    // Para otros recursos, estrategia Cache First
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request).then(response => {
                    // Verificar si la respuesta es válida
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clonar la respuesta
                    const responseToCache = response.clone();
                    
                    // Agregar al cache
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
            .catch(() => {
                // Si falla todo, devolver página offline
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                
                // Para imágenes, devolver placeholder
                if (event.request.destination === 'image') {
                    return caches.match('/icons/vibra-192.png');
                }
                
                return new Response('Sin conexión', {
                    status: 408,
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});

// Manejar mensajes push
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    
    const options = {
        body: data.body || 'Nuevo mensaje en Vibra Chat',
        icon: '/icons/vibra-192.png',
        badge: '/icons/vibra-192.png',
        tag: 'vibra-chat',
        data: data.data || {},
        actions: [
            {
                action: 'open',
                title: 'Abrir Chat'
            },
            {
                action: 'dismiss',
                title: 'Cerrar'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Vibra Chat', options)
    );
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
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
    }
});

// Sincronización en background
self.addEventListener('sync', event => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    // Sincronizar mensajes pendientes
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
        try {
            await sendMessageToServer(message);
            await removePendingMessage(message.id);
        } catch (error) {
            console.error('Error sincronizando mensaje:', error);
        }
    }
}

// Funciones auxiliares para sync
async function getPendingMessages() {
    // Implementar lógica para obtener mensajes pendientes
    return [];
}

async function sendMessageToServer(message) {
    // Implementar lógica para enviar mensaje
    return Promise.resolve();
}

async function removePendingMessage(messageId) {
    // Implementar lógica para eliminar mensaje pendiente
    return Promise.resolve();
}