// Notificaciones Push con Firebase Cloud Messaging
import { messaging, getToken, onMessage } from './firebase-config.js';

class NotificationService {
    constructor() {
        this.permission = null;
        this.fcmToken = null;
        this.vapidKey = 'BEpkN2OMSwl3vMNNGgA2Mjxcvb5aCNQKkqIuZ1_MPkUfKvQjVbM6wovhWR12FqRCTp67PGr5cOfhY3r9MX2oSm8';
        this.init();
    }

    async init() {
        try {
            // Verificar compatibilidad
            if (!messaging) {
                console.log('FCM no soportado en este navegador');
                return;
            }

            // Solicitar permiso
            this.permission = await Notification.requestPermission();
            
            if (this.permission === 'granted') {
                await this.getFCMToken();
                this.listenForMessages();
            }
            
        } catch (error) {
            console.error('Error inicializando notificaciones:', error);
        }
    }

    async getFCMToken() {
        try {
            const currentToken = await getToken(messaging, { 
                vapidKey: this.vapidKey 
            });
            
            if (currentToken) {
                this.fcmToken = currentToken;
                console.log('Token FCM:', currentToken);
                
                // Guardar token en Firebase para este usuario
                this.saveTokenToDatabase(currentToken);
                
                return currentToken;
            } else {
                console.log('No se pudo obtener token FCM');
                return null;
            }
        } catch (error) {
            console.error('Error obteniendo token FCM:', error);
            return null;
        }
    }

    async saveTokenToDatabase(token) {
        // Guardar token en Firebase cuando el usuario inicie sesión
        // Esto se debe llamar después del login
        const userId = localStorage.getItem('vibraUserId');
        if (userId) {
            try {
                const { ref, set } = await import('./firebase-config.js');
                const tokenRef = ref(database, `fcmTokens/${userId}`);
                await set(tokenRef, {
                    token: token,
                    updatedAt: Date.now(),
                    platform: this.getPlatform()
                });
            } catch (error) {
                console.error('Error guardando token:', error);
            }
        }
    }

    listenForMessages() {
        if (!messaging) return;

        onMessage(messaging, (payload) => {
            console.log('Mensaje recibido:', payload);
            
            // Mostrar notificación
            this.showNotification(payload);
            
            // Reproducir sonido
            this.playNotificationSound();
            
            // Actualizar UI si es necesario
            this.updateUIOnMessage(payload);
        });
    }

    showNotification(payload) {
        const { title, body, icon, click_action } = payload.notification || {};
        
        const notificationOptions = {
            body: body || 'Nuevo mensaje en Vibra Chat',
            icon: icon || '/icons/vibra-192.png',
            badge: '/icons/vibra-192.png',
            tag: 'vibra-chat-notification',
            requireInteraction: true,
            actions: [
                {
                    action: 'open',
                    title: 'Abrir Chat'
                },
                {
                    action: 'dismiss',
                    title: 'Cerrar'
                }
            ],
            data: payload.data || {}
        };

        // Mostrar notificación
        const notification = new Notification(title || 'Vibra Chat', notificationOptions);

        // Manejar clic en notificación
        notification.onclick = (event) => {
            event.preventDefault();
            
            if (click_action) {
                window.open(click_action, '_blank');
            } else {
                window.focus();
            }
            
            notification.close();
        };

        // Manejar acciones
        notification.onaction = (event) => {
            if (event.action === 'open') {
                window.focus();
                if (payload.data?.chatId) {
                    // Navegar al chat específico
                    window.location.hash = `#chat/${payload.data.chatId}`;
                }
            }
            notification.close();
        };
    }

    playNotificationSound() {
        const audio = new Audio('/audio/message-received.mp3');
        audio.volume = 0.3;
        audio.play().catch(console.error);
    }

    updateUIOnMessage(payload) {
        // Actualizar contador de mensajes no leídos
        if (payload.data?.type === 'message') {
            const currentCount = parseInt(localStorage.getItem('unreadCount') || '0');
            localStorage.setItem('unreadCount', (currentCount + 1).toString());
            
            // Actualizar badge en el título
            this.updateTitleBadge(currentCount + 1);
            
            // Emitir evento personalizado
            const event = new CustomEvent('new-message', { detail: payload });
            document.dispatchEvent(event);
        }
    }

    updateTitleBadge(count) {
        const originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = count > 0 ? `(${count}) ${originalTitle}` : originalTitle;
    }

    getPlatform() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        if (/android/i.test(userAgent)) return 'android';
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) return 'ios';
        if (/windows phone/i.test(userAgent)) return 'windows';
        return 'web';
    }

    // Enviar notificación a otro usuario
    async sendNotificationToUser(userId, notificationData) {
        try {
            // En producción, usarías Cloud Functions
            // Para demo, simulamos el envío
            
            const notification = {
                to: `/topics/user_${userId}`, // O usar token específico
                notification: {
                    title: notificationData.title,
                    body: notificationData.body,
                    icon: notificationData.icon || '/icons/vibra-192.png',
                    click_action: notificationData.click_action || window.location.origin
                },
                data: {
                    type: notificationData.type || 'message',
                    senderId: notificationData.senderId,
                    chatId: notificationData.chatId,
                    timestamp: Date.now().toString()
                }
            };

            console.log('Enviando notificación:', notification);
            
            // Aquí iría la llamada a tu backend o Cloud Function
            return true;
            
        } catch (error) {
            console.error('Error enviando notificación:', error);
            return false;
        }
    }

    // Limpiar notificaciones
    clearNotifications() {
        localStorage.setItem('unreadCount', '0');
        this.updateTitleBadge(0);
    }
}

export default new NotificationService();