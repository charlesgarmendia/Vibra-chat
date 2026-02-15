// Notificaciones Push con Firebase Cloud Messaging
import { messaging, getToken, onMessage, database, ref, set } from './firebase-config.js';

class NotificationService {
    constructor() {
        this.permission = null;
        this.fcmToken = null;
        this.vapidKey = 'BEpkN2OMSwl3vMNNGgA2Mjxcvb5aCNQKkqIuZ1_MPkUfKvQjVbM6wovhWR12FqRCTp67PGr5cOfhY3r9MX2oSm8';
        this.init();
    }

    async init() {
        try {
            if (!messaging) {
                console.log('FCM no soportado en este navegador');
                return;
            }

            if (!('Notification' in window)) {
                console.log('Notificaciones no soportadas');
                return;
            }

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
                console.log('Token FCM obtenido');
                await this.saveTokenToDatabase(currentToken);
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
        const userId = localStorage.getItem('vibraUserId');
        if (userId && database) {
            try {
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
            
            this.showNotification(payload);
            this.playNotificationSound();
            this.updateUIOnMessage(payload);
        });
    }

    showNotification(payload) {
        const title = payload.notification?.title || payload.data?.title || 'Vibra Chat';
        const options = {
            body: payload.notification?.body || payload.data?.body || 'Nuevo mensaje',
            icon: payload.notification?.icon || '/icons/vibra-192.png',
            badge: '/icons/vibra-192.png',
            tag: 'vibra-chat',
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

        const notification = new Notification(title, options);

        notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            
            if (payload.data?.chatId && window.vibraChat) {
                window.vibraChat.startChat(payload.data.chatId);
            }
            
            notification.close();
        };

        notification.onaction = (event) => {
            if (event.action === 'open') {
                window.focus();
                if (payload.data?.chatId && window.vibraChat) {
                    window.vibraChat.startChat(payload.data.chatId);
                }
            }
            notification.close();
        };
    }

    playNotificationSound() {
        const audio = new Audio('/audio/message-received.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    }

    updateUIOnMessage(payload) {
        if (payload.data?.type === 'message' && payload.data?.chatId) {
            const currentCount = parseInt(localStorage.getItem('unreadMessages') || '0');
            localStorage.setItem('unreadMessages', (currentCount + 1).toString());
            
            if (window.vibraChat) {
                window.vibraChat.updateUnreadBadge(currentCount + 1);
            }
            
            const event = new CustomEvent('new-message', { detail: payload });
            document.dispatchEvent(event);
        }
    }

    getPlatform() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        if (/android/i.test(userAgent)) return 'android';
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) return 'ios';
        if (/windows phone/i.test(userAgent)) return 'windows';
        return 'web';
    }

    async sendNotificationToUser(userId, notificationData) {
        try {
            console.log('Enviando notificación a usuario:', userId, notificationData);
            
            const notification = {
                to: `/topics/user_${userId}`,
                notification: {
                    title: notificationData.title,
                    body: notificationData.body,
                    icon: notificationData.icon || '/icons/vibra-192.png'
                },
                data: {
                    type: notificationData.type || 'message',
                    senderId: notificationData.senderId,
                    chatId: notificationData.chatId || userId,
                    timestamp: Date.now().toString()
                }
            };

            return true;
            
        } catch (error) {
            console.error('Error enviando notificación:', error);
            return false;
        }
    }

    clearNotifications() {
        localStorage.setItem('unreadMessages', '0');
        if (window.vibraChat) {
            window.vibraChat.updateUnreadBadge(0);
        }
    }
}

export default new NotificationService();