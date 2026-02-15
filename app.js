// Vibra Chat - Versión 100% Funcional con Firebase Messaging REAL
import {
    database, auth, storage,
    ref, set, get, update, remove, onValue, push, query, 
    orderByChild, equalTo, onDisconnect, serverTimestamp,
    signInAnonymously, onAuthStateChanged, signOut,
    storageRef, uploadBytesResumable, getDownloadURL
} from './firebase-config.js';

import FileUploader from './upload-handler.js';
import NotificationService from './notification-service.js';

class VibraChat {
    constructor() {
        this.currentUser = null;
        this.currentChat = null;
        this.onlineUsers = new Map();
        this.addedContacts = new Map();
        this.chatMessages = new Map();
        this.userListeners = new Map();
        this.isRecording = false;
        this.mediaRecorder = null;
        this.is3DMode = true;
        this.pendingMessages = [];
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.initFirebase();
        this.initUI();
        this.checkExistingSession();
        this.setupServiceWorker();
        this.loadLocalMessages();
    }
    
    async initFirebase() {
        try {
            // Configurar presencia online
            this.setupPresence();
            
            // Escuchar cambios de autenticación
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    await this.handleUserLogin(user);
                } else {
                    this.handleUserLogout();
                }
            });
            
        } catch (error) {
            console.error('Error inicializando Firebase:', error);
            this.showError('Error de conexión');
        }
    }
    
    async setupPresence() {
        // Sistema de presencia en tiempo real
        const connectedRef = ref(database, '.info/connected');
        
        onValue(connectedRef, async (snap) => {
            if (snap.val() === true) {
                // Estamos conectados
                const user = auth.currentUser;
                if (user) {
                    const userStatusRef = ref(database, `status/${user.uid}`);
                    const userStatusDatabaseRef = ref(database, `users/${user.uid}/status`);
                    
                    // Establecer online
                    await set(userStatusRef, {
                        state: 'online',
                        last_changed: serverTimestamp(),
                    });
                    
                    await set(userStatusDatabaseRef, 'online');
                    
                    // Configurar onDisconnect
                    await onDisconnect(userStatusRef).set({
                        state: 'offline',
                        last_changed: serverTimestamp(),
                    });
                    
                    await onDisconnect(userStatusDatabaseRef).set('offline');
                    
                    // Sincronizar mensajes pendientes al reconectar
                    this.syncPendingMessages();
                }
            }
        });
    }
    
    // Cargar mensajes almacenados localmente
    loadLocalMessages() {
        try {
            const storedMessages = localStorage.getItem('vibraChatMessages');
            if (storedMessages) {
                const messages = JSON.parse(storedMessages);
                this.chatMessages = new Map(Object.entries(messages));
                console.log('Mensajes locales cargados');
            }
        } catch (error) {
            console.error('Error cargando mensajes locales:', error);
        }
    }
    
    // Guardar mensajes localmente
    saveLocalMessages() {
        try {
            const messagesObject = Object.fromEntries(this.chatMessages);
            localStorage.setItem('vibraChatMessages', JSON.stringify(messagesObject));
        } catch (error) {
            console.error('Error guardando mensajes locales:', error);
        }
    }
    
    // Sincronizar mensajes pendientes
    async syncPendingMessages() {
        if (!navigator.onLine || !this.currentUser) return;
        
        try {
            const pending = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
            for (const msg of pending) {
                await this.sendMessage(msg.content, msg.type, msg.fileInfo);
            }
            localStorage.removeItem('pendingMessages');
        } catch (error) {
            console.error('Error sincronizando mensajes:', error);
        }
    }
    
    async handleUserLogin(firebaseUser) {
        try {
            // Mostrar loader
            this.showLoader('Iniciando sesión...');
            
            // Verificar si el usuario existe en la base de datos
            const userRef = ref(database, `users/${firebaseUser.uid}`);
            const userSnap = await get(userRef);
            
            if (userSnap.exists()) {
                // Usuario existente
                this.currentUser = {
                    uid: firebaseUser.uid,
                    ...userSnap.val()
                };
            } else {
                // Nuevo usuario - obtener datos del formulario
                const username = document.getElementById('username')?.value || 'Usuario';
                const gender = document.querySelector('input[name="gender"]:checked')?.value || 'male';
                
                // Crear usuario en la base de datos
                const userData = {
                    uid: firebaseUser.uid,
                    name: username,
                    gender: gender,
                    status: 'online',
                    bio: 'Bienvenido a Vibra Chat!',
                    avatar: gender,
                    createdAt: serverTimestamp(),
                    lastSeen: serverTimestamp(),
                    fcmToken: NotificationService.fcmToken
                };
                
                await set(userRef, userData);
                this.currentUser = userData;
            }
            
            // Guardar token FCM si ya tenemos uno
            if (NotificationService.fcmToken) {
                try {
                    const tokenRef = ref(database, `fcmTokens/${this.currentUser.uid}`);
                    await set(tokenRef, {
                        token: NotificationService.fcmToken,
                        updatedAt: Date.now(),
                        platform: navigator.platform,
                        userAgent: navigator.userAgent
                    });
                    console.log('✅ Token FCM guardado en Firebase');
                } catch (e) {
                    console.log('Error guardando token FCM:', e);
                }
            }
            
            // Guardar en localStorage
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            localStorage.setItem('vibraUserId', this.currentUser.uid);
            
            // Actualizar UI
            this.updateUIAfterLogin();
            
            // Ocultar loader
            this.hideLoader();
            
            // Inicializar servicios
            try {
                await NotificationService.getFCMToken();
            } catch (e) {
                console.log('Notificaciones no disponibles, continuando...', e);
            }
            
            // Cargar datos
            this.loadContacts();
            this.listenForMessages();
            this.listenForOnlineUsers();
            
            // Ocultar login, mostrar app
            document.getElementById('loginScreen')?.classList.remove('active');
            document.getElementById('appScreen')?.classList.add('active');
            
            this.showNotification(`¡Bienvenido ${this.currentUser.name}!`);
            
        } catch (error) {
            console.error('Error en login:', error);
            this.hideLoader();
            this.showError('Error al iniciar sesión: ' + error.message);
        }
    }
    
    updateUIAfterLogin() {
        if (!this.currentUser) return;
        
        // Actualizar sidebar
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userID').textContent = `ID: ${this.currentUser.uid.substring(0, 8)}`;
        
        // Actualizar avatar
        const avatarElement = document.querySelector('.profile-pic');
        if (avatarElement) {
            avatarElement.innerHTML = this.getAvatarHTML(this.currentUser);
        }
        
        // Actualizar título
        document.title = `Vibra Chat - ${this.currentUser.name}`;
    }
    
    getAvatarHTML(user) {
        if (user.avatarUrl) {
            return `<img src="${user.avatarUrl}" alt="${this.escapeHtml(user.name)}" class="avatar-img">`;
        } else {
            const icon = user.gender === 'male' ? 'mars' : 'venus';
            return `<i class="fas fa-${icon}"></i>`;
        }
    }
    
    async loadContacts() {
        try {
            // Cargar contactos agregados de Firebase
            const contactsRef = ref(database, `users/${this.currentUser.uid}/contacts`);
            onValue(contactsRef, (snapshot) => {
                this.addedContacts.clear();
                
                snapshot.forEach((childSnapshot) => {
                    const contact = childSnapshot.val();
                    this.addedContacts.set(contact.uid, contact);
                });
                
                this.renderAddedContacts();
            });
            
        } catch (error) {
            console.error('Error cargando contactos:', error);
        }
    }
    
    renderAddedContacts() {
        const container = document.getElementById('addedContacts');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.addedContacts.size === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No tienes contactos agregados</p></div>';
            return;
        }
        
        this.addedContacts.forEach((contact, contactId) => {
            const card = document.createElement('div');
            card.className = 'contact-card';
            card.innerHTML = `
                <div class="contact-header">
                    <div class="contact-avatar ${contact.gender}">
                        ${this.getAvatarHTML(contact)}
                    </div>
                    <div class="contact-info">
                        <h4>${this.escapeHtml(contact.name)}</h4>
                        <p>${this.escapeHtml(contact.bio || '')}</p>
                    </div>
                </div>
                <div class="contact-actions">
                    <button class="btn-chat" data-userid="${contactId}"><i class="fas fa-comment"></i> Chat</button>
                    <button class="btn-remove" data-userid="${contactId}"><i class="fas fa-user-minus"></i></button>
                </div>
            `;
            
            card.querySelector('.btn-chat').addEventListener('click', () => this.startChat(contactId));
            card.querySelector('.btn-remove').addEventListener('click', () => this.removeContact(contactId));
            
            container.appendChild(card);
        });
    }
    
    async removeContact(contactId) {
        if (!confirm('¿Eliminar este contacto?')) return;
        
        try {
            const contactRef = ref(database, `users/${this.currentUser.uid}/contacts/${contactId}`);
            await remove(contactRef);
            this.showNotification('Contacto eliminado');
        } catch (error) {
            console.error('Error eliminando contacto:', error);
            this.showError('Error al eliminar contacto');
        }
    }
    
    async addContact(userId) {
        try {
            const userRef = ref(database, `users/${userId}`);
            const userSnap = await get(userRef);
            
            if (!userSnap.exists()) {
                this.showError('Usuario no encontrado');
                return;
            }
            
            const user = userSnap.val();
            
            const contactRef = ref(database, `users/${this.currentUser.uid}/contacts/${userId}`);
            await set(contactRef, {
                uid: userId,
                name: user.name,
                gender: user.gender,
                avatarUrl: user.avatarUrl,
                addedAt: serverTimestamp()
            });
            
            this.showNotification(`${user.name} agregado a contactos`);
            
        } catch (error) {
            console.error('Error agregando contacto:', error);
            this.showError('Error al agregar contacto');
        }
    }
    
    async listenForOnlineUsers() {
        try {
            const usersRef = ref(database, 'users');
            
            onValue(usersRef, (snapshot) => {
                this.onlineUsers.clear();
                
                snapshot.forEach((childSnapshot) => {
                    const user = childSnapshot.val();
                    const userId = childSnapshot.key;
                    
                    // No incluir al usuario actual
                    if (userId === this.currentUser?.uid) return;
                    
                    this.onlineUsers.set(userId, user);
                });
                
                // Actualizar contador
                const onlineCountEl = document.getElementById('onlineCount');
                if (onlineCountEl) {
                    onlineCountEl.textContent = this.onlineUsers.size;
                }
                
                // Renderizar usuarios online
                this.renderOnlineUsers();
                this.renderWallProfiles();
                
            }, { onlyOnce: false });
            
        } catch (error) {
            console.error('Error escuchando usuarios:', error);
        }
    }
    
    renderOnlineUsers() {
        const container = document.getElementById('onlineContacts');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.onlineUsers.size === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios en línea</p></div>';
            return;
        }
        
        this.onlineUsers.forEach((user, userId) => {
            const card = this.createUserCard(user, userId);
            container.appendChild(card);
        });
    }
    
    createUserCard(user, userId) {
        const card = document.createElement('div');
        card.className = `user-card ${user.status === 'online' ? 'online' : 'offline'}`;
        card.dataset.userId = userId;
        
        card.innerHTML = `
            <div class="user-card-header">
                <div class="user-avatar">
                    ${this.getAvatarHTML(user)}
                    <span class="status-indicator ${user.status === 'online' ? 'online' : 'offline'}"></span>
                </div>
                <div class="user-info">
                    <h4>${this.escapeHtml(user.name)}</h4>
                    <p class="user-status">${user.status === 'online' ? 'En línea' : 'Desconectado'}</p>
                    <p class="user-bio">${this.escapeHtml(user.bio || 'Usuario de Vibra Chat')}</p>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn-chat" data-userid="${userId}">
                    <i class="fas fa-comment"></i> Chatear
                </button>
                <button class="btn-add-contact" data-userid="${userId}">
                    <i class="fas fa-user-plus"></i> Agregar
                </button>
            </div>
        `;
        
        // Agregar event listeners
        card.querySelector('.btn-chat').addEventListener('click', () => this.startChat(userId));
        card.querySelector('.btn-add-contact').addEventListener('click', () => this.addContact(userId));
        
        return card;
    }
    
    renderWallProfiles() {
        const container = document.getElementById('wallProfiles');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.onlineUsers.size === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user"></i><p>No hay usuarios disponibles</p></div>';
            return;
        }
        
        this.onlineUsers.forEach((user, userId) => {
            const card = document.createElement('div');
            card.className = 'profile-card';
            card.innerHTML = `
                <div class="profile-avatar ${user.gender}">
                    ${this.getAvatarHTML(user)}
                </div>
                <h3 class="profile-name">${this.escapeHtml(user.name)}</h3>
                <p class="profile-id">ID: ${userId.substring(0, 8)}</p>
                <span class="profile-status ${user.status}">${user.status === 'online' ? '🟢 En línea' : '⚫ Desconectado'}</span>
                <p class="profile-bio">${this.escapeHtml(user.bio || '')}</p>
                <button class="btn-chat" data-userid="${userId}"><i class="fas fa-comment"></i> Chatear</button>
            `;
            
            card.querySelector('.btn-chat').addEventListener('click', () => this.startChat(userId));
            
            container.appendChild(card);
        });
    }
    
    async listenForMessages() {
        if (!this.currentUser) return;
        
        try {
            const messagesRef = ref(database, `chats/${this.currentUser.uid}`);
            
            onValue(messagesRef, (snapshot) => {
                snapshot.forEach((childSnapshot) => {
                    const chatId = childSnapshot.key;
                    const messages = [];
                    
                    childSnapshot.forEach((messageSnap) => {
                        messages.push({
                            id: messageSnap.key,
                            ...messageSnap.val()
                        });
                    });
                    
                    // Verificar si hay mensajes nuevos
                    const existingMessages = this.chatMessages.get(chatId) || [];
                    const newMessages = messages.filter(msg => 
                        !existingMessages.some(existing => existing.id === msg.id)
                    );
                    
                    if (newMessages.length > 0) {
                        // Agregar mensajes nuevos
                        const updatedMessages = [...existingMessages, ...newMessages];
                        this.chatMessages.set(chatId, updatedMessages);
                        this.saveLocalMessages();
                        
                        // Mostrar notificación para mensajes recibidos
                        newMessages.forEach(msg => {
                            if (msg.senderId !== this.currentUser.uid) {
                                this.handleIncomingMessage(msg);
                            }
                        });
                        
                        // Si este chat está abierto, actualizar mensajes
                        if (this.currentChat?.uid === chatId) {
                            this.renderChatMessages(chatId);
                        }
                        
                        // Eliminar mensajes de Firebase después de procesarlos
                        this.deleteMessagesFromFirebase(chatId);
                    }
                });
                
                // Actualizar historial
                this.renderChatHistory();
                
            });
            
        } catch (error) {
            console.error('Error escuchando mensajes:', error);
        }
    }
    
    // Eliminar mensajes de Firebase después de recibirlos
    async deleteMessagesFromFirebase(chatId) {
        if (!this.currentUser) return;
        
        try {
            const messagesRef = ref(database, `chats/${this.currentUser.uid}/${chatId}`);
            await remove(messagesRef);
            console.log(`Mensajes del chat ${chatId} eliminados de Firebase`);
        } catch (error) {
            console.error('Error eliminando mensajes:', error);
        }
    }
    
    // Manejar mensaje entrante
    handleIncomingMessage(message) {
        // Actualizar contador de no leídos
        const unreadKey = `unread_${message.senderId}`;
        const currentCount = parseInt(localStorage.getItem(unreadKey) || '0');
        localStorage.setItem(unreadKey, (currentCount + 1).toString());
        
        // Actualizar badge en historial
        this.updateUnreadBadgeForChat(message.senderId, currentCount + 1);
        
        // Actualizar contador total
        this.updateTotalUnreadCount();
        
        // Reproducir sonido
        this.playSound('received');
        
        // Mostrar notificación si la página no está activa
        if (document.visibilityState !== 'visible') {
            if (Notification.permission === 'granted') {
                new Notification(message.senderName || 'Nuevo mensaje', {
                    body: message.type === 'text' ? message.content : `Envió un ${message.type}`,
                    icon: '/icons/vibra-192.png'
                });
            }
        }
    }
    
    updateUnreadBadgeForChat(chatId, count) {
        const badge = document.getElementById(`unread_${chatId}`);
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }
    
    updateTotalUnreadCount() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('unread_')) {
                total += parseInt(localStorage.getItem(key) || '0');
            }
        }
        
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'flex' : 'none';
        }
        
        // Actualizar título
        const originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = total > 0 ? `(${total}) ${originalTitle}` : originalTitle;
    }
    
    renderChatHistory() {
        const container = document.getElementById('chatHistory');
        if (!container) return;
        
        container.innerHTML = '';
        
        const chats = Array.from(this.chatMessages.entries())
            .map(([chatId, messages]) => {
                const lastMessage = messages[messages.length - 1];
                const unread = parseInt(localStorage.getItem(`unread_${chatId}`) || '0');
                return { chatId, lastMessage, unread };
            })
            .sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        
        if (chats.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>No hay conversaciones</p></div>';
            return;
        }
        
        chats.forEach(chat => {
            if (!chat.lastMessage) return;
            
            const user = this.onlineUsers.get(chat.chatId) || { name: 'Usuario', gender: 'male' };
            
            const card = document.createElement('div');
            card.className = 'chat-history-item';
            card.innerHTML = `
                <div class="chat-avatar ${user.gender}">
                    ${this.getAvatarHTML(user)}
                </div>
                <div class="chat-info">
                    <h4>${this.escapeHtml(user.name)}</h4>
                    <p>${this.escapeHtml(chat.lastMessage.content.substring(0, 30))}${chat.lastMessage.content.length > 30 ? '...' : ''}</p>
                </div>
                <div class="chat-meta">
                    <span class="chat-time">${new Date(chat.lastMessage.timestamp).toLocaleTimeString()}</span>
                    ${chat.unread > 0 ? `<span class="unread-badge" id="unread_${chat.chatId}">${chat.unread}</span>` : ''}
                </div>
            `;
            
            card.addEventListener('click', () => this.startChat(chat.chatId));
            
            container.appendChild(card);
        });
    }
    
    async sendMessage(content, type = 'text', fileInfo = null) {
        if (!this.currentUser || !this.currentChat || !content) return;
        
        // Si no hay conexión, guardar como pendiente
        if (!navigator.onLine) {
            const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
            pendingMessages.push({ content, type, fileInfo, receiverId: this.currentChat.uid });
            localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
            this.showNotification('Mensaje guardado para enviar cuando haya conexión', 'warning');
            return;
        }
        
        try {
            const timestamp = Date.now();
            const messageId = `${this.currentUser.uid}_${timestamp}_${Math.random().toString(36).substring(7)}`;
            
            const messageData = {
                id: messageId,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.name,
                receiverId: this.currentChat.uid,
                content: content,
                type: type,
                timestamp: timestamp,
                read: false,
                fileInfo: fileInfo
            };
            
            // Guardar en el chat del remitente (localmente)
            const senderMessages = this.chatMessages.get(this.currentChat.uid) || [];
            senderMessages.push(messageData);
            this.chatMessages.set(this.currentChat.uid, senderMessages);
            this.saveLocalMessages();
            
            // Actualizar UI inmediatamente (optimista)
            this.renderChatMessages(this.currentChat.uid);
            
            // Guardar en el chat del receptor (Firebase)
            const receiverRef = ref(database, `chats/${this.currentChat.uid}/${this.currentUser.uid}/${messageId}`);
            await set(receiverRef, messageData);
            
            // Actualizar último mensaje
            const lastMessageRef = ref(database, `lastMessages/${this.currentUser.uid}_${this.currentChat.uid}`);
            await set(lastMessageRef, {
                ...messageData,
                participants: [this.currentUser.uid, this.currentChat.uid]
            });
            
            // Enviar notificación push
            try {
                await NotificationService.sendNotificationToUser(this.currentChat.uid, {
                    title: this.currentUser.name,
                    body: type === 'text' ? content : `Envió un ${type}`,
                    type: 'message',
                    senderId: this.currentUser.uid,
                    chatId: this.currentChat.uid
                });
            } catch (e) {
                console.log('Error en notificación push:', e);
            }
            
            // Reproducir sonido de enviado
            this.playSound('sent');
            
            return messageId;
            
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            
            // Guardar como pendiente si hay error
            const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
            pendingMessages.push({ content, type, fileInfo, receiverId: this.currentChat.uid });
            localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
            
            this.showError('Error enviando mensaje. Se guardó para reintentar');
            return null;
        }
    }
    
    async sendImage(file) {
        try {
            // Mostrar indicador de carga
            this.showUploadProgress(file.name, 0);
            
            // Subir imagen
            const fileInfo = await FileUploader.uploadFile(file, this.currentUser.uid, 'image');
            
            // Enviar mensaje con la imagen
            const messageId = await this.sendMessage(
                `📷 Imagen: ${file.name}`, 
                'image', 
                fileInfo
            );
            
            // Actualizar progreso a 100%
            this.showUploadProgress(file.name, 100, true);
            
            return messageId;
            
        } catch (error) {
            console.error('Error enviando imagen:', error);
            this.showError('Error enviando imagen');
            return null;
        }
    }
    
    async sendAudio(blob) {
        try {
            // Convertir blob a archivo
            const audioFile = new File([blob], 'audio-message.webm', {
                type: 'audio/webm'
            });
            
            // Subir audio
            const fileInfo = await FileUploader.uploadFile(audioFile, this.currentUser.uid, 'audio');
            
            // Enviar mensaje con el audio
            const messageId = await this.sendMessage(
                '🎤 Mensaje de voz',
                'audio',
                fileInfo
            );
            
            return messageId;
            
        } catch (error) {
            console.error('Error enviando audio:', error);
            this.showError('Error enviando audio');
            return null;
        }
    }
    
    async startAudioRecording() {
        try {
            this.mediaRecorder = await FileUploader.startAudioRecording();
            this.isRecording = true;
            
            // Actualizar UI
            const recordBtn = document.getElementById('recordBtn');
            if (recordBtn) {
                recordBtn.classList.add('recording');
            }
            const recordStatus = document.getElementById('recordStatus');
            if (recordStatus) {
                recordStatus.textContent = 'Grabando...';
            }
            
            // Comenzar grabación
            this.mediaRecorder.start();
            
            // Configurar timeout automático (60 segundos máximo)
            this.recordingTimeout = setTimeout(() => {
                this.stopAudioRecording();
            }, 60000);
            
        } catch (error) {
            console.error('Error iniciando grabación:', error);
            this.showError('No se pudo acceder al micrófono');
        }
    }
    
    async stopAudioRecording() {
        if (!this.mediaRecorder || !this.isRecording) return;
        
        try {
            // Detener grabación
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Limpiar timeout
            clearTimeout(this.recordingTimeout);
            
            // Actualizar UI
            const recordBtn = document.getElementById('recordBtn');
            if (recordBtn) {
                recordBtn.classList.remove('recording');
            }
            const recordStatus = document.getElementById('recordStatus');
            if (recordStatus) {
                recordStatus.textContent = '';
            }
            
            // Esperar a que termine la grabación
            return new Promise((resolve) => {
                this.mediaRecorder.onstop = async () => {
                    const audioFile = await this.mediaRecorder.export();
                    resolve(audioFile);
                };
            });
            
        } catch (error) {
            console.error('Error deteniendo grabación:', error);
            return null;
        }
    }
    
    async handleLogin() {
        const username = document.getElementById('username').value.trim();
        const gender = document.querySelector('input[name="gender"]:checked')?.value;
        
        if (!username) {
            this.showError('Por favor ingresa un nombre');
            return;
        }
        
        try {
            // Autenticación anónima con Firebase
            await signInAnonymously(auth);
            
        } catch (error) {
            console.error('Error en login:', error);
            this.showError('Error al iniciar sesión: ' + error.message);
        }
    }
    
    async handleLogout() {
        if (confirm('¿Estás seguro de cerrar sesión?')) {
            try {
                // Limpiar datos locales
                localStorage.removeItem('vibraUser');
                localStorage.removeItem('vibraUserId');
                this.currentUser = null;
                this.onlineUsers.clear();
                this.addedContacts.clear();
                
                // Cerrar sesión en Firebase
                await signOut(auth);
                
                // Mostrar pantalla de login
                document.getElementById('appScreen').classList.remove('active');
                document.getElementById('loginScreen').classList.add('active');
                
                // Limpiar formulario
                document.getElementById('username').value = '';
                
                this.showNotification('Sesión cerrada');
                
            } catch (error) {
                console.error('Error cerrando sesión:', error);
                this.showError('Error cerrando sesión');
            }
        }
    }
    
    async startChat(userId) {
        try {
            // Mostrar publicidad primero
            await this.showAd();
            
            // Obtener datos del usuario
            const userRef = ref(database, `users/${userId}`);
            const userSnap = await get(userRef);
            
            if (!userSnap.exists()) {
                this.showError('Usuario no encontrado');
                return;
            }
            
            this.currentChat = {
                uid: userId,
                ...userSnap.val()
            };
            
            // Actualizar UI del chat
            this.updateChatHeader();
            
            // Cargar mensajes
            this.renderChatMessages(userId);
            
            // Mostrar sección de chat
            this.showSection('chat');
            
            // Marcar mensajes como leídos
            localStorage.setItem(`unread_${userId}`, '0');
            this.updateTotalUnreadCount();
            
        } catch (error) {
            console.error('Error iniciando chat:', error);
            this.showError('Error al iniciar chat');
        }
    }
    
    async showAd() {
        return new Promise((resolve) => {
            const adOverlay = document.getElementById('adOverlay');
            if (!adOverlay) {
                resolve();
                return;
            }
            
            // Mostrar overlay
            adOverlay.style.display = 'flex';
            
            // Configurar Monetag
            if (window.MonetagIntegration) {
                window.MonetagIntegration.showAd();
            }
            
            // Configurar botón de cerrar
            const closeBtn = document.getElementById('closeAdBtn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    adOverlay.style.display = 'none';
                    resolve();
                };
            }
            
            // Cerrar automáticamente después de 5 segundos
            setTimeout(() => {
                if (adOverlay.style.display !== 'none') {
                    adOverlay.style.display = 'none';
                    resolve();
                }
            }, 5000);
        });
    }
    
    updateChatHeader() {
        if (!this.currentChat) return;
        
        const chatUserName = document.getElementById('chatUserName');
        if (chatUserName) {
            chatUserName.textContent = this.currentChat.name;
        }
        
        const chatUserStatus = document.getElementById('chatUserStatus');
        if (chatUserStatus) {
            chatUserStatus.textContent = this.currentChat.status === 'online' ? 'En línea' : 'Desconectado';
        }
        
        const chatAvatar = document.querySelector('.chat-user-pic');
        if (chatAvatar) {
            chatAvatar.innerHTML = this.getAvatarHTML(this.currentChat);
        }
    }
    
    renderChatMessages(chatId) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        container.innerHTML = '';
        
        const messages = this.chatMessages.get(chatId) || [];
        
        // Ordenar por timestamp
        messages.sort((a, b) => a.timestamp - b.timestamp);
        
        messages.forEach((msg) => {
            const messageElement = this.createMessageElement(msg);
            container.appendChild(messageElement);
        });
        
        // Scroll al final
        container.scrollTop = container.scrollHeight;
    }
    
    createMessageElement(msg) {
        const div = document.createElement('div');
        const isSender = msg.senderId === this.currentUser.uid;
        div.className = `message ${isSender ? 'sent' : 'received'}`;
        
        const time = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let contentHTML = '';
        
        switch (msg.type) {
            case 'image':
                contentHTML = `
                    <div class="message-image">
                        <img src="${this.escapeHtml(msg.fileInfo?.url)}" alt="Imagen" onclick="vibraChat.openImage('${this.escapeHtml(msg.fileInfo?.url)}')">
                        <p class="image-caption">${this.escapeHtml(msg.content)}</p>
                    </div>
                `;
                break;
                
            case 'audio':
                contentHTML = `
                    <div class="message-audio">
                        <audio controls src="${this.escapeHtml(msg.fileInfo?.url)}"></audio>
                        <p>${this.escapeHtml(msg.content)}</p>
                    </div>
                `;
                break;
                
            default:
                contentHTML = `<p>${this.escapeHtml(msg.content)}</p>`;
        }
        
        div.innerHTML = `
            <div class="message-content">
                ${contentHTML}
                <div class="message-time">${time}</div>
            </div>
        `;
        
        return div;
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    openImage(url) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <img src="${url}" alt="Imagen">
                <button class="close-modal"><i class="fas fa-times"></i></button>
            </div>
        `;
        
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.body.appendChild(modal);
    }
    
    setupEventListeners() {
        // Login
        document.getElementById('loginBtn')?.addEventListener('click', () => this.handleLogin());
        
        // Enviar mensaje
        document.getElementById('sendMessageBtn')?.addEventListener('click', () => this.handleSendMessage());
        document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        
        // Multimedia
        document.getElementById('imageBtn')?.addEventListener('click', () => this.openImagePicker());
        document.getElementById('cameraBtn')?.addEventListener('click', () => this.openCamera());
        document.getElementById('audioBtn')?.addEventListener('click', () => this.toggleAudioRecording());
        
        // Navegación
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleSidebar());
        document.getElementById('backToContacts')?.addEventListener('click', () => this.showSection('contacts'));
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());
        
        // Perfil
        document.getElementById('profileBtn')?.addEventListener('click', () => this.showProfile());
        document.getElementById('saveProfileBtn')?.addEventListener('click', () => this.saveProfile());
        document.getElementById('avatarUpload')?.addEventListener('change', (e) => this.handleAvatarUpload(e));
        
        // Búsqueda
        document.getElementById('searchBtn')?.addEventListener('click', () => this.searchUsers());
        document.getElementById('userSearch')?.addEventListener('input', () => this.handleSearchInput());
        
        // Filtros
        document.getElementById('genderFilter')?.addEventListener('change', (e) => this.filterUsers(e.target.value));
        
        // Modos
        document.getElementById('toggle3D')?.addEventListener('click', () => this.toggle3DMode());
        document.getElementById('toggle4D')?.addEventListener('click', () => this.toggle4DMode());
        
        // Window events
        window.addEventListener('beforeunload', () => this.handleBeforeUnload());
        window.addEventListener('online', () => {
            this.showNotification('Conexión restablecida');
            this.syncPendingMessages();
        });
        window.addEventListener('offline', () => this.showError('Sin conexión a internet'));
        
        // Notificaciones
        document.addEventListener('new-message', (e) => this.handleNewMessageNotification(e.detail));
    }
    
    async handleSendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message || !this.currentChat) return;
        
        await this.sendMessage(message);
        
        input.value = '';
        input.focus();
    }
    
    async openImagePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = false;
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.sendImage(file);
            }
        };
        
        input.click();
    }
    
    async openCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.showCameraInterface(stream);
        } catch (error) {
            console.error('Error accediendo a cámara:', error);
            this.showError('No se pudo acceder a la cámara');
        }
    }
    
    showCameraInterface(stream) {
        const cameraModal = document.createElement('div');
        cameraModal.className = 'camera-modal';
        
        cameraModal.innerHTML = `
            <div class="camera-container">
                <video id="cameraPreview" autoplay></video>
                <div class="camera-controls">
                    <button id="captureBtn" class="btn-capture">
                        <i class="fas fa-camera"></i>
                    </button>
                    <button id="closeCamera" class="btn-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(cameraModal);
        
        const video = cameraModal.querySelector('#cameraPreview');
        video.srcObject = stream;
        
        cameraModal.querySelector('#captureBtn').onclick = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            
            canvas.toBlob(async (blob) => {
                const file = new File([blob], 'camera-photo.jpg', {
                    type: 'image/jpeg'
                });
                
                await this.sendImage(file);
                
                stream.getTracks().forEach(track => track.stop());
                cameraModal.remove();
            }, 'image/jpeg', 0.9);
        };
        
        cameraModal.querySelector('#closeCamera').onclick = () => {
            stream.getTracks().forEach(track => track.stop());
            cameraModal.remove();
        };
    }
    
    async toggleAudioRecording() {
        if (this.isRecording) {
            const audioFile = await this.stopAudioRecording();
            if (audioFile) {
                await this.sendAudio(audioFile);
            }
        } else {
            await this.startAudioRecording();
        }
    }
    
    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            this.showLoader('Subiendo foto...');
            
            const avatarInfo = await FileUploader.uploadAvatar(file, this.currentUser.uid);
            
            const userRef = ref(database, `users/${this.currentUser.uid}`);
            await update(userRef, {
                avatarUrl: avatarInfo.original.url,
                avatarThumbnail: avatarInfo.thumbnail.url,
                updatedAt: serverTimestamp()
            });
            
            this.currentUser.avatarUrl = avatarInfo.original.url;
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            
            this.updateUIAfterLogin();
            
            this.showNotification('Foto de perfil actualizada');
            
        } catch (error) {
            console.error('Error subiendo avatar:', error);
            this.showError('Error subiendo foto');
        } finally {
            this.hideLoader();
        }
    }
    
    async saveProfile() {
        try {
            const name = document.getElementById('profileName').value.trim();
            const bio = document.getElementById('profileBio').value.trim();
            const status = document.getElementById('profileStatus').value;
            
            if (!name) {
                this.showError('El nombre es requerido');
                return;
            }
            
            const updates = {
                name: name,
                bio: bio,
                status: status,
                updatedAt: serverTimestamp()
            };
            
            const userRef = ref(database, `users/${this.currentUser.uid}`);
            await update(userRef, updates);
            
            Object.assign(this.currentUser, updates);
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            
            this.updateUIAfterLogin();
            
            this.showNotification('Perfil actualizado');
            this.showSection('contacts');
            
        } catch (error) {
            console.error('Error guardando perfil:', error);
            this.showError('Error guardando perfil');
        }
    }
    
    showProfile() {
        document.getElementById('profileName').value = this.currentUser.name || '';
        document.getElementById('profileBio').value = this.currentUser.bio || '';
        document.getElementById('profileStatus').value = this.currentUser.status || 'online';
        
        const avatarPreview = document.querySelector('.avatar-preview');
        if (avatarPreview) {
            avatarPreview.innerHTML = this.getAvatarHTML(this.currentUser);
        }
        
        this.showSection('profile');
    }
    
    searchUsers() {
        const query = document.getElementById('userSearch')?.value.toLowerCase() || '';
        const genderFilter = document.getElementById('genderFilter')?.value || 'all';
        
        const container = document.getElementById('searchResults');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!query) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Ingresa un término de búsqueda</p></div>';
            return;
        }
        
        const results = [];
        this.onlineUsers.forEach((user, userId) => {
            if (user.name.toLowerCase().includes(query)) {
                if (genderFilter === 'all' || user.gender === genderFilter) {
                    results.push({ userId, ...user });
                }
            }
        });
        
        if (results.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No se encontraron usuarios</p></div>';
            return;
        }
        
        results.forEach(user => {
            const card = document.createElement('div');
            card.className = 'profile-card';
            card.innerHTML = `
                <div class="profile-avatar ${user.gender}">
                    ${this.getAvatarHTML(user)}
                </div>
                <h3 class="profile-name">${this.escapeHtml(user.name)}</h3>
                <p class="profile-id">ID: ${user.userId.substring(0, 8)}</p>
                <span class="profile-status ${user.status}">${user.status === 'online' ? '🟢 En línea' : '⚫ Desconectado'}</span>
                <p class="profile-bio">${this.escapeHtml(user.bio || '')}</p>
                <button class="btn-chat" data-userid="${user.userId}"><i class="fas fa-comment"></i> Chatear</button>
            `;
            
            card.querySelector('.btn-chat').addEventListener('click', () => this.startChat(user.userId));
            
            container.appendChild(card);
        });
    }
    
    handleSearchInput() {
        this.searchUsers();
    }
    
    filterUsers(gender) {
        this.searchUsers();
    }
    
    showSection(section) {
        document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));
        
        if (section === 'chat') {
            document.getElementById('chatSection')?.classList.add('active');
        } else if (section === 'contacts') {
            document.getElementById('contactsSection')?.classList.add('active');
        } else if (section === 'wall') {
            document.getElementById('wallSection')?.classList.add('active');
            this.renderWallProfiles();
        } else if (section === 'history') {
            document.getElementById('historySection')?.classList.add('active');
            this.renderChatHistory();
        } else if (section === 'profile') {
            document.getElementById('profileSection')?.classList.add('active');
        }
        
        this.closeSidebar();
    }
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) sidebar.classList.toggle('active');
        if (mainContent) mainContent.classList.toggle('sidebar-open');
    }
    
    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) sidebar.classList.remove('active');
        if (mainContent) mainContent.classList.remove('sidebar-open');
    }
    
    toggle3DMode() {
        this.is3DMode = true;
        document.body.classList.remove('four-d-mode');
        document.body.classList.add('three-d-mode');
        const btn3d = document.getElementById('toggle3D');
        const btn4d = document.getElementById('toggle4D');
        if (btn3d) btn3d.classList.add('active');
        if (btn4d) btn4d.classList.remove('active');
    }
    
    toggle4DMode() {
        this.is3DMode = false;
        document.body.classList.remove('three-d-mode');
        document.body.classList.add('four-d-mode');
        const btn3d = document.getElementById('toggle3D');
        const btn4d = document.getElementById('toggle4D');
        if (btn4d) btn4d.classList.add('active');
        if (btn3d) btn3d.classList.remove('active');
    }
    
    showUploadProgress(filename, progress, complete = false) {
        let progressDiv = document.getElementById('uploadProgress');
        
        if (!progressDiv) {
            progressDiv = document.createElement('div');
            progressDiv.id = 'uploadProgress';
            progressDiv.className = 'upload-progress';
            document.body.appendChild(progressDiv);
        }
        
        if (complete) {
            setTimeout(() => {
                if (progressDiv) progressDiv.remove();
            }, 2000);
            return;
        }
        
        progressDiv.innerHTML = `
            <div class="upload-info">
                <span class="upload-filename">${filename}</span>
                <span class="upload-percentage">${progress}%</span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progress}%"></div>
            </div>
        `;
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
    showLoader(text = 'Cargando...') {
        const loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'global-loader';
        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <p>${text}</p>
        `;
        
        document.body.appendChild(loader);
    }
    
    hideLoader() {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.remove();
        }
    }
    
    playSound(type) {
        const audio = new Audio(`/audio/message-${type}.mp3`);
        audio.volume = 0.3;
        audio.play().catch(() => {});
    }
    
    async setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('Service Worker registrado:', registration);
            } catch (error) {
                console.error('Error registrando Service Worker:', error);
            }
        }
    }
    
    checkExistingSession() {
        const savedUser = localStorage.getItem('vibraUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                // Auto-login con Firebase
                signInAnonymously(auth).catch(() => {});
            } catch (error) {
                localStorage.removeItem('vibraUser');
            }
        }
    }
    
    handleBeforeUnload() {
        if (this.currentUser) {
            const userRef = ref(database, `users/${this.currentUser.uid}/status`);
            set(userRef, 'offline').catch(() => {});
        }
    }
    
    handleConnectionChange(isOnline) {
        if (isOnline) {
            this.showNotification('Conexión restablecida');
            this.syncPendingMessages();
        } else {
            this.showError('Sin conexión a internet');
        }
    }
    
    handleNewMessageNotification(payload) {
        const currentCount = parseInt(localStorage.getItem('unreadMessages') || '0');
        localStorage.setItem('unreadMessages', (currentCount + 1).toString());
        this.updateUnreadBadge(currentCount + 1);
    }
    
    updateUnreadBadge(count) {
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }
}

// Inicializar app
window.vibraChat = new VibraChat();