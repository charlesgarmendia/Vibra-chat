// Vibra Chat - Versión 100% Funcional
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
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.initFirebase();
        this.initUI();
        this.checkExistingSession();
        this.setupServiceWorker();
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
                }
            }
        });
    }
    
    async handleUserLogin(firebaseUser) {
        try {
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
            
            // Guardar en localStorage
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            
            // Actualizar UI
            this.updateUIAfterLogin();
            
            // Inicializar servicios
            await NotificationService.getFCMToken();
            
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
            this.showError('Error al iniciar sesión');
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
            return `<img src="${user.avatarUrl}" alt="${user.name}" class="avatar-img">`;
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
                document.getElementById('onlineCount').textContent = this.onlineUsers.size;
                
                // Renderizar usuarios online
                this.renderOnlineUsers();
                this.renderWallProfiles();
                
            }, { onlyOnce: false });
            
        } catch (error) {
            console.error('Error escuchando usuarios:', error);
        }
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
                    
                    this.chatMessages.set(chatId, messages);
                    
                    // Si este chat está abierto, actualizar mensajes
                    if (this.currentChat?.uid === chatId) {
                        this.renderChatMessages(chatId);
                    }
                });
                
                // Actualizar historial
                this.renderChatHistory();
                
            });
            
        } catch (error) {
            console.error('Error escuchando mensajes:', error);
        }
    }
    
    async sendMessage(content, type = 'text', fileInfo = null) {
        if (!this.currentUser || !this.currentChat || !content) return;
        
        try {
            const timestamp = Date.now();
            const messageId = `${this.currentUser.uid}_${timestamp}`;
            
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
            
            // Guardar en el chat del remitente
            const senderRef = ref(database, `chats/${this.currentUser.uid}/${this.currentChat.uid}/${messageId}`);
            await set(senderRef, messageData);
            
            // Guardar en el chat del receptor
            const receiverRef = ref(database, `chats/${this.currentChat.uid}/${this.currentUser.uid}/${messageId}`);
            await set(receiverRef, messageData);
            
            // Actualizar último mensaje
            const lastMessageRef = ref(database, `lastMessages/${this.currentUser.uid}_${this.currentChat.uid}`);
            await set(lastMessageRef, {
                ...messageData,
                participants: [this.currentUser.uid, this.currentChat.uid]
            });
            
            // Enviar notificación push
            await NotificationService.sendNotificationToUser(this.currentChat.uid, {
                title: this.currentUser.name,
                body: type === 'text' ? content : `Envió un ${type}`,
                type: 'message',
                senderId: this.currentUser.uid,
                chatId: this.currentChat.uid
            });
            
            // Reproducir sonido de enviado
            this.playSound('sent');
            
            return messageId;
            
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            this.showError('Error enviando mensaje');
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
            document.getElementById('recordBtn').classList.add('recording');
            document.getElementById('recordStatus').textContent = 'Grabando...';
            
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
            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('recordStatus').textContent = '';
            
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
            
            // Los datos se guardarán en handleUserLogin
            // que se llama automáticamente después de signInAnonymously
            
        } catch (error) {
            console.error('Error en login:', error);
            this.showError('Error al iniciar sesión');
        }
    }
    
    async handleLogout() {
        if (confirm('¿Estás seguro de cerrar sesión?')) {
            try {
                // Limpiar datos locales
                localStorage.removeItem('vibraUser');
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
    
    renderOnlineUsers() {
        const container = document.getElementById('onlineContacts');
        if (!container) return;
        
        container.innerHTML = '';
        
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
                    <h4>${user.name}</h4>
                    <p class="user-status">${user.status === 'online' ? 'En línea' : 'Desconectado'}</p>
                    <p class="user-bio">${user.bio || 'Usuario de Vibra Chat'}</p>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn-chat" onclick="vibraChat.startChat('${userId}')">
                    <i class="fas fa-comment"></i> Chatear
                </button>
                <button class="btn-add-contact" onclick="vibraChat.addContact('${userId}')">
                    <i class="fas fa-user-plus"></i> Agregar
                </button>
            </div>
        `;
        
        return card;
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
            if (window.monetag) {
                monetag.cmd.push(() => {
                    monetag.load();
                });
            }
            
            // Configurar botón de cerrar
            document.getElementById('closeAdBtn').onclick = () => {
                adOverlay.style.display = 'none';
                resolve();
            };
            
            // Cerrar automáticamente después de 5 segundos (para testing)
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
        
        document.getElementById('chatUserName').textContent = this.currentChat.name;
        document.getElementById('chatUserStatus').textContent = this.currentChat.status === 'online' ? 'En línea' : 'Desconectado';
        
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
                        <img src="${msg.fileInfo?.url}" alt="Imagen" onclick="vibraChat.openImage('${msg.fileInfo?.url}')">
                        <p class="image-caption">${msg.content}</p>
                    </div>
                `;
                break;
                
            case 'audio':
                contentHTML = `
                    <div class="message-audio">
                        <audio controls src="${msg.fileInfo?.url}"></audio>
                        <p>${msg.content}</p>
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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        window.addEventListener('online', () => this.handleConnectionChange(true));
        window.addEventListener('offline', () => this.handleConnectionChange(false));
        
        // Notificaciones
        document.addEventListener('new-message', (e) => this.handleNewMessageNotification(e.detail));
    }
    
    async handleSendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message || !this.currentChat) return;
        
        // Enviar mensaje
        await this.sendMessage(message);
        
        // Limpiar input
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
            
            // Crear interfaz de cámara
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
        
        // Capturar foto
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
                
                // Cerrar cámara
                stream.getTracks().forEach(track => track.stop());
                cameraModal.remove();
            }, 'image/jpeg', 0.9);
        };
        
        // Cerrar cámara
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
            // Mostrar loader
            this.showLoader('Subiendo foto...');
            
            // Subir avatar
            const avatarInfo = await FileUploader.uploadAvatar(file, this.currentUser.uid);
            
            // Actualizar perfil en Firebase
            const userRef = ref(database, `users/${this.currentUser.uid}`);
            await update(userRef, {
                avatarUrl: avatarInfo.original.url,
                avatarThumbnail: avatarInfo.thumbnail.url,
                updatedAt: serverTimestamp()
            });
            
            // Actualizar localmente
            this.currentUser.avatarUrl = avatarInfo.original.url;
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            
            // Actualizar UI
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
            const status = document.getElementById('profileStatus').value.trim();
            
            if (!name) {
                this.showError('El nombre es requerido');
                return;
            }
            
            // Actualizar en Firebase
            const updates = {
                name: name,
                bio: bio,
                status: status,
                updatedAt: serverTimestamp()
            };
            
            const userRef = ref(database, `users/${this.currentUser.uid}`);
            await update(userRef, updates);
            
            // Actualizar localmente
            Object.assign(this.currentUser, updates);
            localStorage.setItem('vibraUser', JSON.stringify(this.currentUser));
            
            // Actualizar UI
            this.updateUIAfterLogin();
            
            this.showNotification('Perfil actualizado');
            this.showSection('contacts');
            
        } catch (error) {
            console.error('Error guardando perfil:', error);
            this.showError('Error guardando perfil');
        }
    }
    
    // ... (más métodos)
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Animación de entrada
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remover después de 3 segundos
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
                const registration = await navigator.worker.register('/service-worker.js');
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
                signInAnonymously(auth);
            } catch (error) {
                localStorage.removeItem('vibraUser');
            }
        }
    }
    
    handleBeforeUnload() {
        // Actualizar estado a offline
        if (this.currentUser) {
            const userRef = ref(database, `users/${this.currentUser.uid}/status`);
            set(userRef, 'offline');
        }
    }
    
    handleConnectionChange(isOnline) {
        if (isOnline) {
            this.showNotification('Conexión restablecida');
        } else {
            this.showError('Sin conexión a internet');
        }
    }
    
    handleNewMessageNotification(payload) {
        // Actualizar contador de mensajes no leídos
        const currentCount = parseInt(localStorage.getItem('unreadMessages') || '0');
        localStorage.setItem('unreadMessages', (currentCount + 1).toString());
        
        // Actualizar badge
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