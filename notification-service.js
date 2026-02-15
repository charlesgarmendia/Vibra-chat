// Notificaciones Push con Firebase Cloud Messaging - VERSIÓN REAL
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
            // Verificar soporte de notificaciones
            if (!('Notification' in window)) {
                console.log('Este navegador no soporta notificaciones');
                return;
            }

            // Solicitar permiso
            this.permission = await Notification.requestPermission();
            
            if (this.permission === 'granted') {
                console.log('Permiso de notificaciones concedido');
                await this.getFCMToken();
                this.listenForMessages();
            } else {
                console.log('Permiso de notificaciones denegado');
            }
            
        } catch (error) {
            console.error('Error inicializando notificaciones:', error);
        }
    }

    async getFCMToken() {
        try {
            if (!messaging) {
                throw new Error('Messaging no está inicializado');
            }

            const currentToken = await getToken(messaging, { 
                vapidKey: this.vapidKey 
            });
            
            if (currentToken) {
                this.fcmToken = currentToken;
                console.log('✅ Token FCM obtenido:', currentToken.substring(0, 20) + '...');
                
                // Guardar token cuando el usuario esté logueado
                const userId = localStorage.getItem('vibraUserId');
                if (userId) {
                    await this.saveTokenToDatabase(currentToken, userId);
                }
                
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

    async saveTokenToDatabase(token, userId) {
        try {
            const tokenRef = ref(database, `fcmTokens/${userId}`);
            await set(tokenRef, {
                token: token,
                updatedAt: Date.now(),
                platform: this.getPlatform(),
                userAgent: navigator.userAgent
            });
            console.log('✅ Token guardado en Firebase');
        } catch (error) {
            console.error('Error guardando token:', error);
        }
    }

    listenForMessages() {
        if (!messaging) return;

        onMessage(messaging, (payload) => {
            console.log('📨 Mensaje recibido en primer plano:', payload);
            
            // Mostrar notificación si la página no está enfocada
            if (document.visibilityState !== 'visible') {
                this.showNotification(payload);
            }
            
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
            data: payload.data || {},
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

        // Usar la API de notificaciones del navegador
        if (Notification.permission === 'granted') {
            const notification = new Notification(title, options);

            notification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                
                if (payload.data?.chatId && window.vibraChat) {
                    window.vibraChat.startChat(payload.data.chatId);
                }
                
                notification.close();
            };
        }
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

    // Enviar notificación a otro usuario (simulado - en producción usarías Cloud Functions)
    async sendNotificationToUser(userId, notificationData) {
        try {
            console.log('📤 Enviando notificación a usuario:', userId, notificationData);
            
            // Aquí en una app real usarías una Cloud Function
            // Por ahora simulamos que se envió correctamente
            
            const event = new CustomEvent('new-message', { 
                detail: { 
                    data: {
                        title: notificationData.title,
                        body: notificationData.body,
                        chatId: notificationData.chatId,
                        type: notificationData.type
                    }
                } 
            });
            document.dispatchEvent(event);
            
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