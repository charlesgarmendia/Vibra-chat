// Sistema REAL de subida de archivos a Firebase Storage
import { storage, storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from './firebase-config.js';

class FileUploader {
    constructor() {
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.allowedTypes = {
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'],
            audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp3'],
            video: ['video/mp4', 'video/webm', 'video/ogg']
        };
    }

    async uploadFile(file, userId, type = 'image') {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.validateFile(file, type)) {
                    reject(new Error(`Tipo de archivo no permitido o excede ${this.maxFileSize / 1024 / 1024}MB`));
                    return;
                }

                let fileToUpload = file;
                if (type === 'image' && file.size > 1024 * 1024) {
                    fileToUpload = await this.compressImage(file);
                }

                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(7);
                const fileName = `${type}s/${userId}/${timestamp}_${randomId}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                
                const fileRef = storageRef(storage, fileName);
                
                const metadata = {
                    contentType: file.type,
                    customMetadata: {
                        uploadedBy: userId,
                        originalName: file.name,
                        uploadedAt: timestamp.toString()
                    }
                };

                const uploadTask = uploadBytesResumable(fileRef, fileToUpload, metadata);
                
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Subiendo: ${progress}%`);
                        
                        const event = new CustomEvent('upload-progress', {
                            detail: { progress, fileName: file.name }
                        });
                        document.dispatchEvent(event);
                    },
                    (error) => {
                        console.error('Error subiendo archivo:', error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            
                            resolve({
                                url: downloadURL,
                                name: file.name,
                                type: file.type,
                                size: file.size,
                                storagePath: fileName,
                                uploadedAt: timestamp
                            });
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
                
            } catch (error) {
                reject(error);
            }
        });
    }

    validateFile(file, type) {
        if (file.size > this.maxFileSize) {
            return false;
        }
        
        if (!this.allowedTypes[type]?.includes(file.type)) {
            return false;
        }
        
        return true;
    }

    async compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    let width = img.width;
                    let height = img.height;
                    const maxSize = 1200;
                    
                    if (width > height && width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', 0.8);
                };
            };
        });
    }

    async deleteFile(storagePath) {
        try {
            const fileRef = storageRef(storage, storagePath);
            await deleteObject(fileRef);
            return true;
        } catch (error) {
            console.error('Error eliminando archivo:', error);
            return false;
        }
    }

    async uploadAvatar(file, userId) {
        try {
            const resizedAvatar = await this.resizeAvatar(file, 300, 300);
            const avatarInfo = await this.uploadFile(resizedAvatar, userId, 'image');
            
            const thumbnail = await this.resizeAvatar(file, 100, 100);
            const thumbnailInfo = await this.uploadFile(thumbnail, userId, 'image');
            
            return {
                original: avatarInfo,
                thumbnail: thumbnailInfo
            };
            
        } catch (error) {
            throw error;
        }
    }

    async resizeAvatar(file, width, height) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    
                    const scale = Math.max(width / img.width, height / img.height);
                    const x = (width - img.width * scale) / 2;
                    const y = (height - img.height * scale) / 2;
                    
                    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                    
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], `avatar_${width}x${height}.jpg`, {
                            type: 'image/jpeg'
                        }));
                    }, 'image/jpeg', 0.9);
                };
            };
        });
    }

    async startAudioRecording() {
        return new Promise(async (resolve, reject) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream);
                const audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const audioFile = new File([audioBlob], 'audio-message.webm', {
                        type: 'audio/webm'
                    });
                    
                    // Añadir método export al mediaRecorder
                    mediaRecorder.export = () => audioFile;
                    
                    resolve(audioFile);
                    stream.getTracks().forEach(track => track.stop());
                };
                
                resolve(mediaRecorder);
                
            } catch (error) {
                reject(new Error('No se pudo acceder al micrófono'));
            }
        });
    }
}

export default new FileUploader();