class DiscordUploader {
    constructor() {
        // UI Elements
        this.fileInput = document.getElementById('fileInput');
        this.progressText = document.querySelector('.progress-text');
        this.progressFill = document.querySelector('.progress-fill');
        this.statusMessage = document.querySelector('.status-message');
        this.errorMessage = document.querySelector('.error-message');
        this.webhookUrlInput = document.getElementById('webhookUrl');
        
        // Upload configuration
        this.CHUNK_SIZE = 10 * 1024 * 1024; // 10MB in bytes
        this.MAX_RETRIES = 3;              // Maximum number of retry attempts
        this.RETRY_DELAY = 2000;           // Delay between retries in ms
        this.RATE_LIMIT_DELAY = 1500;      // Delay between chunk uploads to avoid rate limiting
        this.MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB max file size
        this.MAX_STORED_UPLOADS = 25;      // Maximum number of uploads to store in local storage
        this.STORAGE_CLEANUP_THRESHOLD = 10 * 1024 * 1024; // 10MB of localStorage threshold
        
        // Upload state
        this.isUploading = false;
        this.isPaused = false;
        this.uploadQueue = [];
        this.currentChunkIndex = 0;
        this.uploadedChunks = 0;
        this.totalChunks = 0;
        this.chunkUploadResults = [];
        
        // Event listeners
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // Add listeners for buttons if they exist
        const startButton = document.getElementById('startUpload');
        const pauseButton = document.getElementById('pauseUpload');
        const resumeButton = document.getElementById('resumeUpload');
        const cancelButton = document.getElementById('cancelUpload');
        
        if (startButton) startButton.addEventListener('click', this.startUpload.bind(this));
        if (pauseButton) pauseButton.addEventListener('click', this.pauseUpload.bind(this));
        if (resumeButton) resumeButton.addEventListener('click', this.resumeUpload.bind(this));
        if (cancelButton) cancelButton.addEventListener('click', this.cancelUpload.bind(this));
    }

    // Generate a random filename with mixed case letters and numbers
    generateRandomFilename(originalFilename, chunkIndex, totalChunks) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Get file extension
        const extension = originalFilename.match(/\.[0-9a-z]+$/i)?.[0] || '';
        const baseName = originalFilename.replace(/\.[^/.]+$/, "");
        
        // Add chunk information to filename
        return `${baseName}_${result}_part${String(chunkIndex).padStart(3, '0')}_of_${totalChunks}${extension}`;
    }
    
    // Calculate a simple checksum for a file
    async calculateChecksum(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = e.target.result;
                let hash = 0;
                
                // Simple hash function for demo purposes
                // In production, use a proper hashing algorithm like SHA-256
                for (let i = 0; i < data.byteLength; i++) {
                    hash = ((hash << 5) - hash) + (new Uint8Array(data)[i]);
                    hash |= 0; // Convert to 32bit integer
                }
                
                resolve(Math.abs(hash).toString(16));
            };
            reader.readAsArrayBuffer(file.slice(0, Math.min(file.size, 5 * 1024 * 1024))); // Read first 5MB for checksum
        });
    }
    
    // Validate webhook URL
    validateWebhookUrl(url) {
        if (!url) return false;
        
        // Check if URL is valid and matches Discord webhook format
        // Accept both discord.com and discordapp.com domains
        const discordWebhookRegex = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/;
        
        // Add visual indicator for validation result
        const webhookUrlInput = document.getElementById('webhookUrl');
        const validationMessage = document.querySelector('.validation-message');
        
        if (url && discordWebhookRegex.test(url)) {
            if (webhookUrlInput) webhookUrlInput.classList.remove('input-error');
            if (validationMessage) {
                validationMessage.classList.remove('visible');
            }
            return true;
        } else {
            if (webhookUrlInput) webhookUrlInput.classList.add('input-error');
            if (validationMessage) {
                validationMessage.textContent = 'Please enter a valid Discord webhook URL';
                validationMessage.classList.add('visible');
            }
            return false;
        }
    }
    
    // Check if file size is within limits
    validateFileSize(file) {
        if (!file) return false;
        
        const fileSizeWarning = document.querySelector('.file-size-warning');
        
        if (file.size > this.MAX_FILE_SIZE) {
            this.showStatus(`File is too large. Maximum size is ${this.formatFileSize(this.MAX_FILE_SIZE)}.`, true);
            if (fileSizeWarning) {
                fileSizeWarning.textContent = `File is too large. Maximum size is ${this.formatFileSize(this.MAX_FILE_SIZE)}.`;
                fileSizeWarning.classList.add('visible');
            }
            return false;
        } else {
            if (fileSizeWarning) {
                fileSizeWarning.classList.remove('visible');
            }
            return true;
        }
    }

    // Update progress display
    updateProgress(percent) {
        this.progressText.textContent = `${Math.round(percent)}%`;
        this.progressFill.style.width = `${percent}%`;
        
        // Update chunk indicator if available
        const chunkIndicator = document.querySelector('.chunk-indicator');
        if (chunkIndicator && this.totalChunks > 0) {
            chunkIndicator.textContent = `Chunk: ${this.uploadedChunks}/${this.totalChunks}`;
        }
    }
    
    // Update chunk progress display
    updateChunkProgress(percent) {
        const chunkProgressText = document.querySelector('.chunk-progress-text');
        const chunkProgressFill = document.querySelector('.chunk-progress-fill');
        
        if (chunkProgressText) {
            chunkProgressText.textContent = `Current chunk: ${Math.round(percent)}%`;
        }
        
        if (chunkProgressFill) {
            chunkProgressFill.style.width = `${percent}%`;
        }
    }
    // Show status message
    showStatus(message, isError = false) {
        if (!this.statusMessage) return;
        
        this.statusMessage.textContent = message;
        
        if (isError) {
            if (this.errorMessage) {
                this.errorMessage.textContent = message;
                this.errorMessage.style.display = 'block';
                this.statusMessage.textContent = 'Error occurred. See details below.';
            } else {
                this.statusMessage.style.color = '#ff4444';
            }
            console.error('DiscordUploader Error:', message);
        } else {
            this.statusMessage.style.color = '#ffffff';
            if (this.errorMessage) {
                this.errorMessage.style.display = 'none';
                this.errorMessage.textContent = '';
            }
        }
    }
    
    // Check available localStorage space
    checkStorageSpace() {
        let totalSize = 0;
        try {
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length * 2; // Approximate size in bytes
                }
            }
        } catch (e) {
            console.error('Error checking storage space', e);
            return true; // Continue anyway
        }
        
        // If we're approaching storage limits, clean up old uploads
        if (totalSize > this.STORAGE_CLEANUP_THRESHOLD) {
            this.cleanupOldUploads();
        }
        
        return true;
    }
    
    // Clean up old uploads from localStorage
    cleanupOldUploads() {
        try {
            const stored = localStorage.getItem('discordUploads');
            if (!stored) return;
            
            let uploads = JSON.parse(stored);
            
            // If we have too many uploads, sort by date and remove oldest
            if (uploads.length > this.MAX_STORED_UPLOADS) {
                uploads.sort((a, b) => {
                    return new Date(b.uploadDate) - new Date(a.uploadDate);
                });
                
                // Keep only the most recent uploads
                uploads = uploads.slice(0, this.MAX_STORED_UPLOADS);
                
                // Save back to localStorage
                localStorage.setItem('discordUploads', JSON.stringify(uploads));
                console.log(`Cleaned up uploads, now storing ${uploads.length} items`);
            }
        } catch (e) {
            console.error('Error cleaning up uploads', e);
        }
    }

    // Split file into chunks
    splitFileIntoChunks(file) {
        const chunks = [];
        let start = 0;
        
        while (start < file.size) {
            const end = Math.min(start + this.CHUNK_SIZE, file.size);
            chunks.push(file.slice(start, end));
            start = end;
        }
        
        return chunks;
    }

    // Upload a single chunk with retry logic
    async uploadChunk(chunk, filename, webhookUrl, chunkIndex, retryCount = 0) {
        const formData = new FormData();
        formData.append('file', chunk, filename);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                body: formData
            });

            // Handle various HTTP status codes
            if (response.status === 429) {
                // Rate limited - retry after a delay
                const retryAfter = response.headers.get('Retry-After') || 5;
                this.showStatus(`Rate limited. Retrying in ${retryAfter} seconds...`);
                
                if (retryCount < this.MAX_RETRIES) {
                    // Wait for the specified time and retry
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    return this.uploadChunk(chunk, filename, webhookUrl, chunkIndex, retryCount + 1);
                } else {
                    throw new Error('Max retries exceeded for rate limit');
                }
            } else if (response.status === 413) {
                // Entity too large - the chunk size needs to be reduced
                this.showStatus('File chunk too large for Discord. Reducing chunk size...', true);
                
                // If we can retry with a smaller chunk
                if (chunk.size > 4 * 1024 * 1024 && retryCount < this.MAX_RETRIES) {
                    // Reduce the chunk size for future uploads
                    this.CHUNK_SIZE = Math.floor(this.CHUNK_SIZE * 0.75);
                    
                    // Split this chunk into smaller chunks
                    const smallerChunks = [];
                    let start = 0;
                    const newChunkSize = Math.floor(this.CHUNK_SIZE * 0.75);
                    
                    while (start < chunk.size) {
                        const end = Math.min(start + newChunkSize, chunk.size);
                        smallerChunks.push(chunk.slice(start, end));
                        start = end;
                    }
                    
                    // Upload the first smaller chunk and return
                    const newFilename = this.generateRandomFilename(filename, chunkIndex, this.totalChunks);
                    return this.uploadChunk(smallerChunks[0], newFilename, webhookUrl, chunkIndex, retryCount + 1);
                } else {
                    throw new Error('File chunk too large and could not be reduced further');
                }
            } else if (!response.ok) {
                // Other HTTP errors
                if (retryCount < this.MAX_RETRIES) {
                    this.showStatus(`HTTP error ${response.status}. Retrying (${retryCount + 1}/${this.MAX_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                    return this.uploadChunk(chunk, filename, webhookUrl, chunkIndex, retryCount + 1);
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }

            // If we reach here, the upload was successful
            const result = await response.json();
            return result;
        } catch (error) {
            // Network errors or other exceptions
            if (retryCount < this.MAX_RETRIES) {
                this.showStatus(`Upload failed: ${error.message}. Retrying (${retryCount + 1}/${this.MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.uploadChunk(chunk, filename, webhookUrl, chunkIndex, retryCount + 1);
            } else {
                throw new Error(`Upload failed: ${error.message}`);
            }
        }
    }
    
    // Process the upload queue
    async processQueue() {
        if (this.isPaused || this.uploadQueue.length === 0 || !this.isUploading) {
            return;
        }

        const item = this.uploadQueue.shift();
        this.currentChunkIndex = item.index;
        
        try {
            this.showStatus(`Uploading part ${item.index + 1} of ${this.totalChunks}...`);
            
            // Generate a meaningful filename for the chunk
            const chunkFilename = this.generateRandomFilename(
                item.originalFilename,
                item.index + 1,
                this.totalChunks
            );
            
            // Upload the chunk
            const result = await this.uploadChunk(
                item.chunk,
                chunkFilename,
                item.webhookUrl,
                item.index
            );
            
            // Store the result for later reassembly
            this.chunkUploadResults[item.index] = {
                url: result.attachments?.[0]?.url || '',
                filename: chunkFilename,
                size: item.chunk.size,
                index: item.index,
                messageId: result.id
            };
            
            // Update progress
            this.uploadedChunks++;
            const progress = (this.uploadedChunks / this.totalChunks) * 100;
            this.updateProgress(progress);
            
            // Add delay between uploads to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
            
            // Process next chunk
            if (this.uploadQueue.length > 0) {
                this.processQueue();
            } else if (this.uploadedChunks === this.totalChunks) {
                // All chunks uploaded successfully
                this.showStatus('Upload complete!');
                this.isUploading = false;
                
                // Update UI buttons if available
                const startButton = document.getElementById('startUpload');
                const pauseButton = document.getElementById('pauseUpload');
                const resumeButton = document.getElementById('resumeUpload');
                const cancelButton = document.getElementById('cancelUpload');
                
                if (startButton) startButton.disabled = false;
                if (pauseButton) pauseButton.disabled = true;
                if (resumeButton) resumeButton.disabled = true;
                if (cancelButton) cancelButton.disabled = true;
                
                // Store the upload information for later download/management
                this.saveUploadInfo();
            }
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, true);
            this.isUploading = false;
            
            // Update UI buttons
            const startButton = document.getElementById('startUpload');
            const pauseButton = document.getElementById('pauseUpload');
            const resumeButton = document.getElementById('resumeUpload');
            const cancelButton = document.getElementById('cancelUpload');
            
            if (startButton) startButton.disabled = false;
            if (pauseButton) pauseButton.disabled = true;
            if (resumeButton) resumeButton.disabled = true;
            if (cancelButton) cancelButton.disabled = true;
        }
    }
    
    // Save upload information for later retrieval
    saveUploadInfo() {
        if (this.chunkUploadResults.length === 0) return;
        
        // Get the file information
        const file = this.fileInput.files[0];
        if (!file) return;
        
        // Create metadata for the upload
        const uploadInfo = {
            originalFilename: file.name,
            size: file.size,
            type: file.type,
            chunks: this.chunkUploadResults,
            uploadDate: new Date().toISOString(),
            checksum: this.fileChecksum,
            totalChunks: this.totalChunks
        };
        
        // Get existing uploads from localStorage
        let uploads = [];
        try {
            const stored = localStorage.getItem('discordUploads');
            if (stored) {
                uploads = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading stored uploads', e);
        }
        
        // Add this upload and save back to localStorage
        uploads.push(uploadInfo);
        localStorage.setItem('discordUploads', JSON.stringify(uploads));
        
        // Refresh the file list if available
        this.loadUploadedFiles();
    }
    
    // Load and display uploaded files
    loadUploadedFiles() {
        const fileTableBody = document.getElementById('fileTableBody');
        const noFilesMessage = document.getElementById('noFilesMessage');
        
        if (!fileTableBody) return;
        
        // Clear existing entries
        fileTableBody.innerHTML = '';
        
        // Get uploads from localStorage
        let uploads = [];
        try {
            const stored = localStorage.getItem('discordUploads');
            if (stored) {
                uploads = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading stored uploads', e);
        }
        
        // Show/hide no files message
        if (noFilesMessage) {
            noFilesMessage.style.display = uploads.length === 0 ? 'block' : 'none';
        }
        
        // If no uploads, return
        if (uploads.length === 0) return;
        
        // Add each upload to the table
        uploads.forEach((upload, index) => {
            const row = document.createElement('tr');
            
            // Format file size
            const formattedSize = this.formatFileSize(upload.size);
            
            // Format date
            const uploadDate = new Date(upload.uploadDate);
            const formattedDate = uploadDate.toLocaleDateString() + ' ' + uploadDate.toLocaleTimeString();
            
            row.innerHTML = `
                <td>${upload.originalFilename}</td>
                <td>${formattedSize}</td>
                <td>${upload.totalChunks}</td>
                <td>${formattedDate}</td>
                <td>
                    <button class="button download-btn" data-index="${index}">Download</button>
                    <button class="button delete-btn" data-index="${index}">Delete</button>
                </td>
            `;
            
            fileTableBody.appendChild(row);
        });
        
        // Add event listeners to the download and delete buttons
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', this.handleDownload.bind(this));
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', this.handleDelete.bind(this));
        });
    }
    
    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Handle file selection
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Validate file size
        if (!this.validateFileSize(file)) {
            return;
        }

        // Reset progress and state
        this.updateProgress(0);
        this.updateChunkProgress(0);
        this.showStatus('File selected. Ready to upload.');
        this.uploadQueue = [];
        this.chunkUploadResults = [];
        this.uploadedChunks = 0;
        this.currentChunkIndex = 0;
        
        // Calculate chunks
        const chunks = this.splitFileIntoChunks(file);
        this.totalChunks = chunks.length;
        
        // Calculate checksum
        this.fileChecksum = await this.calculateChecksum(file);
        
        // Update UI with file information
        const selectedFileName = document.getElementById('selectedFileName');
        const selectedFileSize = document.getElementById('selectedFileSize');
        const fileChunks = document.getElementById('fileChunks');
        
        if (selectedFileName) selectedFileName.textContent = file.name;
        if (selectedFileSize) selectedFileSize.textContent = this.formatFileSize(file.size);
        if (fileChunks) fileChunks.textContent = chunks.length.toString();
        
        // Enable start upload button if available
        const startButton = document.getElementById('startUpload');
        if (startButton) startButton.disabled = false;
    }
    
    // Start the upload process
    async startUpload() {
        const file = this.fileInput.files[0];
        if (!file) {
            this.showStatus('No file selected', true);
            return;
        }
        
        // Validate file size
        if (!this.validateFileSize(file)) {
            return;
        }
        
        // Check available storage space
        if (!this.checkStorageSpace()) {
            this.showStatus('Local storage is nearly full. Please clear some space before uploading.', true);
            return;
        }
        
        // Get webhook URL
        let webhookUrl = this.webhookUrlInput ? this.webhookUrlInput.value : '';
        
        // If no webhook URL in input, prompt for it
        if (!webhookUrl) {
            webhookUrl = prompt('Please enter your Discord webhook URL:');
        }
        
        // Validate webhook URL
        if (!this.validateWebhookUrl(webhookUrl)) {
            this.showStatus('Invalid Discord webhook URL. Please check and try again.', true);
            return;
        }
        
        // Reset upload state
        this.isUploading = true;
        this.isPaused = false;
        this.uploadQueue = [];
        this.chunkUploadResults = [];
        this.uploadedChunks = 0;
        this.currentChunkIndex = 0;
        
        // Update UI
        this.updateProgress(0);
        this.showStatus('Preparing file for upload...');
        
        // Update UI buttons
        const startButton = document.getElementById('startUpload');
        const pauseButton = document.getElementById('pauseUpload');
        const resumeButton = document.getElementById('resumeUpload');
        const cancelButton = document.getElementById('cancelUpload');
        
        if (startButton) startButton.disabled = true;
        if (pauseButton) pauseButton.disabled = false;
        if (resumeButton) resumeButton.disabled = true;
        if (cancelButton) cancelButton.disabled = false;
        
        try {
            // Split file into chunks
            const chunks = this.splitFileIntoChunks(file);
            this.totalChunks = chunks.length;
            
            // Prepare upload queue
            for (let i = 0; i < chunks.length; i++) {
                this.uploadQueue.push({
                    chunk: chunks[i],
                    index: i,
                    webhookUrl,
                    originalFilename: file.name
                });
            }
            
            // Start processing the queue
            this.processQueue();
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, true);
            this.isUploading = false;
            
            // Update UI buttons
            if (startButton) startButton.disabled = false;
            if (pauseButton) pauseButton.disabled = true;
            if (resumeButton) resumeButton.disabled = true;
            if (cancelButton) cancelButton.disabled = true;
        }
    }
    
    // Pause the upload
    pauseUpload() {
        if (!this.isUploading) return;
        
        this.isPaused = true;
        this.showStatus('Upload paused. Click Resume to continue.');
        
        // Update UI buttons
        const pauseButton = document.getElementById('pauseUpload');
        const resumeButton = document.getElementById('resumeUpload');
        
        if (pauseButton) pauseButton.disabled = true;
        if (resumeButton) resumeButton.disabled = false;
    }
    
    // Resume the upload
    resumeUpload() {
        if (!this.isUploading) return;
        
        this.isPaused = false;
        this.showStatus('Resuming upload...');
        
        // Update UI buttons
        const pauseButton = document.getElementById('pauseUpload');
        const resumeButton = document.getElementById('resumeUpload');
        
        if (pauseButton) pauseButton.disabled = false;
        if (resumeButton) resumeButton.disabled = true;
        
        // Continue processing the queue
        this.processQueue();
    }
    
    // Cancel the upload
    cancelUpload() {
        this.isUploading = false;
        this.isPaused = false;
        this.uploadQueue = [];
        this.showStatus('Upload cancelled.');
        
        // Update UI buttons
        const startButton = document.getElementById('startUpload');
        const pauseButton = document.getElementById('pauseUpload');
        const resumeButton = document.getElementById('resumeUpload');
        const cancelButton = document.getElementById('cancelUpload');
        
        if (startButton) startButton.disabled = false;
        if (pauseButton) pauseButton.disabled = true;
        if (resumeButton) resumeButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;
    }
    
    // Handle download button click
    handleDownload(event) {
        const index = event.target.dataset.index;
        if (index === undefined) return;
        
        // Get uploads from localStorage
        let uploads = [];
        try {
            const stored = localStorage.getItem('discordUploads');
            if (stored) {
                uploads = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading stored uploads', e);
            return;
        }
        
        // Get the selected upload
        const upload = uploads[index];
        if (!upload) {
            this.showStatus('Upload not found', true);
            return;
        }
        
        // Show the download section
        const downloadSection = document.getElementById('downloadSection');
        if (downloadSection) downloadSection.style.display = 'block';
        
        // Update download information
        const downloadFileName = document.getElementById('downloadFileName');
        const downloadFileSize = document.getElementById('downloadFileSize');
        const downloadChunks = document.getElementById('downloadChunks');
        
        if (downloadFileName) downloadFileName.textContent = upload.originalFilename;
        if (downloadFileSize) downloadFileSize.textContent = this.formatFileSize(upload.size);
        if (downloadChunks) downloadChunks.textContent = upload.totalChunks.toString();
        
        // Store the current download index
        this.currentDownloadIndex = index;
        
        // Enable download button
        const startDownloadButton = document.getElementById('startDownload');
        if (startDownloadButton) startDownloadButton.disabled = false;
    }
    
    // Handle delete button click
    handleDelete(event) {
        const index = event.target.dataset.index;
        if (index === undefined) return;
        
        // Get uploads from localStorage
        let uploads = [];
        try {
            const stored = localStorage.getItem('discordUploads');
            if (stored) {
                uploads = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Error loading stored uploads', e);
            return;
        }
        
        // Get the selected upload
        const upload = uploads[index];
        if (!upload) {
            this.showStatus('Upload not found', true);
            return;
        }
        
        // Show delete confirmation modal
        const deleteModal = document.getElementById('deleteModal');
        const deleteFileName = document.getElementById('deleteFileName');
        const confirmDeleteButton = document.getElementById('confirmDelete');
        const cancelDeleteButton = document.getElementById('cancelDelete');
        
        if (deleteModal) {
            // Set filename and show modal
            if (deleteFileName) deleteFileName.textContent = upload.originalFilename;
            deleteModal.style.display = 'block';
            
            // Set up event listeners for buttons
            if (confirmDeleteButton) {
                confirmDeleteButton.onclick = () => {
                    // Remove the upload from localStorage
                    uploads.splice(index, 1);
                    localStorage.setItem('discordUploads', JSON.stringify(uploads));
                    
                    // Hide modal and refresh file list
                    deleteModal.style.display = 'none';
                    this.loadUploadedFiles();
                    this.showStatus('File deleted successfully.');
                };
            }
            
            if (cancelDeleteButton) {
                cancelDeleteButton.onclick = () => {
                    // Just hide the modal
                    deleteModal.style.display = 'none';
                };
            }
        }
    }
}

// Initialize the uploader when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add preload element for background image
    const preloader = document.createElement('div');
    preloader.className = 'preload-images';
    const preloadImg = document.createElement('img');
    preloadImg.src = 'assets/edit-341776933.gif';
    preloader.appendChild(preloadImg);
    document.body.appendChild(preloader);
    
    // Add loading spinner
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loader);
    
    // Hide loader when background image and page are loaded
    window.addEventListener('load', () => {
        setTimeout(() => {
            loader.classList.add('hidden');
            setTimeout(() => {
                loader.remove();
            }, 500);
        }, 500);
    });
    
    const uploader = new DiscordUploader();
    
    // Load saved webhook URL if available
    const webhookUrlInput = document.getElementById('webhookUrl');
    if (webhookUrlInput) {
        const savedWebhookUrl = localStorage.getItem('discordWebhookUrl');
        if (savedWebhookUrl) {
            webhookUrlInput.value = savedWebhookUrl;
            uploader.validateWebhookUrl(savedWebhookUrl);
        }
        
        // Add validation message element if it doesn't exist
        const inputGroup = webhookUrlInput.closest('.input-group');
        if (inputGroup && !inputGroup.querySelector('.validation-message')) {
            const validationMessage = document.createElement('div');
            validationMessage.className = 'validation-message';
            inputGroup.appendChild(validationMessage);
        }
    }
    
    // Add file size warning container if it doesn't exist
    const uploadBox = document.querySelector('.upload-box');
    if (uploadBox && !document.querySelector('.file-size-warning')) {
        const fileSizeWarning = document.createElement('div');
        fileSizeWarning.className = 'file-size-warning';
        uploadBox.after(fileSizeWarning);
    }
    
    // Set up save configuration button
    const saveConfigButton = document.getElementById('saveConfig');
    if (saveConfigButton && webhookUrlInput) {
        saveConfigButton.addEventListener('click', () => {
            const webhookUrl = webhookUrlInput.value;
            if (uploader.validateWebhookUrl(webhookUrl)) {
                localStorage.setItem('discordWebhookUrl', webhookUrl);
                uploader.showStatus('Webhook URL saved successfully.');
            } else {
                uploader.showStatus('Invalid Discord webhook URL. Please check and try again.', true);
            }
        });
    }
    
    // Set up refresh file list button
    const refreshListButton = document.getElementById('refreshList');
    if (refreshListButton) {
        refreshListButton.addEventListener('click', () => {
            uploader.loadUploadedFiles();
        });
    }
    
    // Initialize file list
    uploader.loadUploadedFiles();
    
    // Close modal when clicking outside of it
    window.onclick = (event) => {
        const deleteModal = document.getElementById('deleteModal');
        if (event.target === deleteModal) {
            deleteModal.style.display = 'none';
        }
    };
});
