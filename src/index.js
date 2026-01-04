const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog, globalShortcut, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const net = require('net');
const { spawn, exec } = require('child_process');
const zlib = require('zlib');
const crypto = require('crypto');
const https = require('https');

function getAppVersion() {
    const packagePath = path.join(__dirname, 'package.json');
    try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return pkg.version ? `v${pkg.version}` : 'v0.0.0';
    } catch (e) {
        console.error('Error reading version from package.json:', e);
    }
    return 'v0.0.0';
} 

class NitrogenAPI {
    constructor() {
        this.logMonitorProcess = null;
        this.logRefreshRate = 0.5;
        this.mainWindow = null;
        this.tray = null;
        this.directory = path.join(os.homedir(), 'Nitrogen');
        this.scriptsDirectory = path.join(this.directory, 'scripts');
        this.accountsDirectory = path.join(this.directory, 'accounts');
        this.accountsFile = path.join(this.accountsDirectory, 'accounts.dat');
        this.metadataFile = path.join(this.directory, 'metadata.json');
        this.hydrogenAutoexecDir = path.join(os.homedir(), 'Hydrogen', 'autoexecute');
        this.macsploitAutoexecDir = path.join(os.homedir(), 'Documents', 'Macsploit Automatic Execution');
        this.opiumwareAutoexecDir = path.join(os.homedir(), 'Opiumware', 'autoexec');

        this.ensureDirectories();
        this.syncAutoexecFolders();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.directory)) {
            fs.mkdirSync(this.directory, { recursive: true });
        }
        if (!fs.existsSync(this.scriptsDirectory)) {
            fs.mkdirSync(this.scriptsDirectory, { recursive: true });
        }
        if (!fs.existsSync(this.accountsDirectory)) {
            fs.mkdirSync(this.accountsDirectory, { recursive: true });
        }
    }

    syncAutoexecFolders() {
        try {
            const dirs = [
                { path: this.hydrogenAutoexecDir, name: 'Hydrogen' },
                { path: this.macsploitAutoexecDir, name: 'MacSploit' },
                { path: this.opiumwareAutoexecDir, name: 'OpiumWare' }
            ].filter(d => fs.existsSync(d.path));

            if (dirs.length === 0) return;

            const allScripts = {};
            dirs.forEach(({ path: dir, name }) => {
                fs.readdirSync(dir).filter(f => f.endsWith('.lua')).forEach(filename => {
                    try {
                        if (!allScripts[filename]) {
                            allScripts[filename] = fs.readFileSync(path.join(dir, filename), 'utf8');
                        }
                    } catch (e) {
                        console.error(`Error reading ${name} script ${filename}: ${e.message}`);
                    }
                });
            });

            for (const [scriptName, content] of Object.entries(allScripts)) {
                dirs.forEach(({ path: dir, name }) => {
                    const scriptPath = path.join(dir, scriptName);
                    if (!fs.existsSync(scriptPath)) {
                        try { fs.writeFileSync(scriptPath, content); }
                        catch (e) { console.error(`Error syncing ${scriptName} to ${name}: ${e.message}`); }
                    }
                });
            }
        } catch (e) {
            console.error(`Error syncing autoexec folders: ${e.message}`);
        }
    }

    async getLatestVersion() {
        try {
            const response = await axios.head('https://github.com/JadXV/Nitrogen/releases/latest', {
                maxRedirects: 5
            });
            const finalUrl = response.request.res.responseUrl;
            const latestVersion = finalUrl.includes('/tag/') ? finalUrl.split('/tag/')[1] : null;
            return latestVersion;
        } catch (e) {
            console.error(`Error getting latest version: ${e.message}`);
            return null;
        }
    }

    async getLatestReleaseInfo() {
        try {
            const currentVersion = getAppVersion();
            const response = await axios.get('https://api.github.com/repos/JadXV/Nitrogen/releases');
            if (response.status === 200) {
                const releases = response.data;
                const latestRelease = releases[0];
                
                let currentRelease = releases.find(r => r.tag_name === currentVersion);
                let currentReleaseIndex = releases.findIndex(r => r.tag_name === currentVersion);
                
                if (!currentRelease && currentVersion.endsWith('.0')) {
                    const shortenedVersion = currentVersion.slice(0, -2);
                    currentRelease = releases.find(r => r.tag_name === shortenedVersion);
                    currentReleaseIndex = releases.findIndex(r => r.tag_name === shortenedVersion);
                }
                
                const latestTag = latestRelease?.tag_name;
                const currentTag = currentRelease?.tag_name;
                const isOutdated = latestRelease && currentTag && latestTag !== currentTag;
                
                const releaseData = currentRelease || latestRelease;
                
                const allReleases = releases.map(r => ({
                    version: r.tag_name,
                    name: r.name || r.tag_name,
                    description: r.body || 'No changelog available.',
                    published_at: r.published_at || '',
                    html_url: r.html_url
                }));
                
                return {
                    status: 'success',
                    version: releaseData?.tag_name || currentVersion,
                    name: releaseData?.name || 'Release',
                    description: releaseData?.body || 'No changelog available for this version.',
                    published_at: releaseData?.published_at || '',
                    html_url: releaseData?.html_url || 'https://github.com/JadXV/Nitrogen/releases',
                    isOutdated: isOutdated,
                    latestVersion: latestRelease?.tag_name || null,
                    allReleases: allReleases,
                    currentReleaseIndex: currentReleaseIndex >= 0 ? currentReleaseIndex : 0
                };
            } else {
                return {
                    status: 'error',
                    message: `Failed to fetch release info: HTTP ${response.status}`
                };
            }
        } catch (e) {
            return {
                status: 'error',
                message: `Error fetching release info: ${e.message}`
            };
        }
    }

    getVersion() { return { version: getAppVersion() }; }

    openScriptsFolder() {
        try { shell.openPath(this.scriptsDirectory); }
        catch (e) { console.error(`Error opening scripts folder: ${e.message}`); }
    }

    static HYDRO_START = 6969;
    static HYDRO_END = 7069;
    static MACSPLOIT_START = 5553;
    static MACSPLOIT_END = 5563;
    static OPIUM_START = 8392;
    static OPIUM_END = 8397;

    async checkPortStatus() {
        const portStatus = [];
        
        for (let port = NitrogenAPI.MACSPLOIT_START; port <= NitrogenAPI.MACSPLOIT_END; port++) {
            try {
                const client = new net.Socket();
                const isOnline = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        client.destroy();
                        resolve(false);
                    }, 500);

                    client.connect(port, '127.0.0.1', () => {
                        clearTimeout(timeout);
                        client.destroy();
                        resolve(true);
                    });

                    client.on('error', () => {
                        clearTimeout(timeout);
                        resolve(false);
                    });
                });

                portStatus.push({
                    port: port,
                    type: 'macsploit',
                    online: isOnline,
                    label: `MacSploit :${port}`
                });
            } catch (e) {
                portStatus.push({
                    port: port,
                    type: 'macsploit',
                    online: false,
                    label: `MacSploit :${port}`
                });
            }
        }

        return portStatus;
    }

    async executeScriptOnPort(scriptContent, targetPort) {
        if (!targetPort || targetPort === 'auto') {
            return this.executeScript(scriptContent);
        }

        const port = parseInt(targetPort);
        const messages = [];

        try {
            const client = new net.Socket();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    client.destroy();
                    reject(new Error('Timeout'));
                }, 3000);

                client.connect(port, '127.0.0.1', () => {
                    clearTimeout(timeout);
                    const header = Buffer.alloc(16);
                    header.writeUInt32LE(scriptContent.length + 1, 8);
                    const data = Buffer.concat([header, Buffer.from(scriptContent), Buffer.from('\0')]);
                    
                    client.write(data);
                    client.end();
                    resolve();
                });

                client.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            return {
                status: 'success',
                message: `Script executed successfully via MacSploit on port ${port}`,
                details: messages
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Error: Failed to execute on port ${port}. Make sure the instance is running.`,
                details: messages
            };
        }
    }

    async executeScript(scriptContent) {
        const { HYDRO_START, HYDRO_END, MACSPLOIT_START, MACSPLOIT_END, OPIUM_START, OPIUM_END } = NitrogenAPI;
        let serverPort = null;

        try {
            for (let port = HYDRO_START; port <= HYDRO_END; port++) {
                try {
                    const response = await axios.get(`http://127.0.0.1:${port}/secret`, { 
                        timeout: 1000,
                        validateStatus: () => true
                    });
                    if (response.status === 200 && response.data === '0xdeadbeef') {
                        serverPort = port;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (serverPort) {
                const response = await axios.post(`http://127.0.0.1:${serverPort}/execute`, scriptContent, {
                    headers: { 
                        'Content-Type': 'text/plain',
                        'User-Agent': 'Nitrogen/5.0'
                    },
                    timeout: 10000,
                    validateStatus: () => true
                });

                if (response.status === 200) {
                    return {
                        status: 'success',
                        message: 'Script executed successfully via Hydrogen'
                    };
                }
            }
        } catch (e) {
        }

        for (let port = OPIUM_START; port <= OPIUM_END; port++) {
            try {
                const client = new net.Socket();
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        client.destroy();
                        reject(new Error('Timeout'));
                    }, 3000);

                    client.connect(port, '127.0.0.1', () => {
                        clearTimeout(timeout);
                        const formattedScript = `OpiumwareScript ${scriptContent}`;
                        const codeBytes = Buffer.from(formattedScript, 'utf8');
                        const compressed = zlib.deflateSync(codeBytes);
                        
                        client.write(compressed);
                        client.end();
                        resolve();
                    });

                    client.on('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                });

                return {
                    status: 'success',
                    message: `Script executed successfully via OpiumWare on port ${port}`
                };
            } catch (e) {
                continue;
            }
        }

        const macsploitResults = [];
        const macsploitPromises = [];
        
        for (let port = MACSPLOIT_START; port <= MACSPLOIT_END; port++) {
            macsploitPromises.push(
                (async (currentPort) => {
                    try {
                        const client = new net.Socket();
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                client.destroy();
                                reject(new Error('Timeout'));
                            }, 3000);

                            client.connect(currentPort, '127.0.0.1', () => {
                                clearTimeout(timeout);
                                const header = Buffer.alloc(16);
                                header.writeUInt32LE(scriptContent.length + 1, 8);
                                const data = Buffer.concat([header, Buffer.from(scriptContent), Buffer.from('\0')]);
                                
                                client.write(data);
                                client.end();
                                resolve();
                            });

                            client.on('error', (err) => {
                                clearTimeout(timeout);
                                reject(err);
                            });
                        });

                        macsploitResults.push({ port: currentPort, success: true });
                    } catch (e) {
                    }
                })(port)
            );
        }

        await Promise.all(macsploitPromises);

        if (macsploitResults.length > 0) {
            return {
                status: 'success',
                message: `Script executed successfully via MacSploit on port(s): ${macsploitResults.map(r => r.port).join(', ')}`
            };
        }

        return {
            status: 'error',
            message: 'Error: No compatible executor detected. Make sure Roblox is running and a compatible executor is installed.'
        };
    }

    async getGameName(universeId) {
        try {
            const response = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            const game = response.data?.data?.[0];
            return game?.name 
                ? { status: 'success', game_name: game.name }
                : { status: 'error', message: 'Game not found' };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }

    async getScripts(script) {
        try {
            const url = script === "" 
                ? "https://scriptblox.com/api/script/fetch"
                : `https://scriptblox.com/api/script/search?q=${encodeURIComponent(script)}`;
            const response = await axios.get(url);
            return response.status === 200 ? response.data : { status: 'error', message: `HTTP ${response.status}` };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }

    async openRoblox() {
        try {
            spawn('/Applications/Roblox.app/Contents/MacOS/RobloxPlayer', [], { stdio: 'ignore', detached: true });
            return { status: 'success', message: 'Roblox instance launched successfully' };
        } catch (e) {
            return { status: 'error', message: `Failed to open Roblox: ${e.message}` };
        }
    }

    joinWebsite() {
        try {
            shell.openExternal('https://nitrogen.lol');
            return { status: 'success', message: 'Website opened successfully' };
        } catch (e) {
            return { status: 'error', message: `Failed to open website: ${e.message}` };
        }
    }

    saveScript(name, content, autoExec = false) {
        try {
            if (!name.endsWith('.lua')) {
                name = name + '.lua';
            }

            name = path.basename(name);
            name = name.replace(/[^a-zA-Z0-9. _-]/g, '');

            if (!fs.existsSync(this.scriptsDirectory)) {
                fs.mkdirSync(this.scriptsDirectory, { recursive: true });
            }

            const filePath = path.join(this.scriptsDirectory, name);
            fs.writeFileSync(filePath, content);

            const autoexecDirs = [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir];
            autoexecDirs.forEach(dir => {
                const autoexecPath = path.join(dir, name);
                if (autoExec && fs.existsSync(dir)) {
                    fs.writeFileSync(autoexecPath, content);
                } else if (fs.existsSync(autoexecPath)) {
                    fs.unlinkSync(autoexecPath);
                }
            });

            this.updateTrayMenu();

            return {
                status: 'success',
                message: `Script saved to ${filePath}`,
                path: filePath,
                autoExec: autoExec
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to save script: ${e.message}`
            };
        }
    }

    toggleAutoExec(scriptName, enabled) {
        try {
            const scriptPath = path.join(this.scriptsDirectory, scriptName);
            if (!fs.existsSync(scriptPath)) {
                return { status: 'error', message: `Script ${scriptName} not found` };
            }

            const content = enabled ? fs.readFileSync(scriptPath, 'utf8') : null;
            const autoexecDirs = [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir];
            
            autoexecDirs.forEach(dir => {
                const autoexecPath = path.join(dir, scriptName);
                if (enabled && fs.existsSync(dir)) {
                    fs.writeFileSync(autoexecPath, content);
                } else if (fs.existsSync(autoexecPath)) {
                    fs.unlinkSync(autoexecPath);
                }
            });

            return { status: 'success', message: `Auto-execute ${enabled ? 'enabled' : 'disabled'} for ${scriptName}` };
        } catch (e) {
            return { status: 'error', message: `Failed to update auto-execute status: ${e.message}` };
        }
    }

    getLocalScripts() {
        try {
            if (!fs.existsSync(this.scriptsDirectory)) {
                fs.mkdirSync(this.scriptsDirectory, { recursive: true });
            }

            const autoexecDirs = [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir];
            const scripts = fs.readdirSync(this.scriptsDirectory)
                .filter(file => file.endsWith('.lua'))
                .map(filename => {
                    try {
                        const filePath = path.join(this.scriptsDirectory, filename);
                        return {
                            name: filename,
                            path: filePath,
                            content: fs.readFileSync(filePath, 'utf8'),
                            autoExec: autoexecDirs.some(dir => fs.existsSync(path.join(dir, filename)))
                        };
                    } catch (e) {
                        console.error(`Error reading file ${filename}: ${e.message}`);
                        return null;
                    }
                }).filter(Boolean);

            return { status: 'success', scripts };
        } catch (e) {
            return { status: 'error', message: e.message };
        }
    }

    deleteScript(scriptName) {
        try {
            const scriptPath = path.join(this.scriptsDirectory, scriptName);
            if (!fs.existsSync(scriptPath)) {
                return { status: 'error', message: `Script "${scriptName}" not found` };
            }

            fs.unlinkSync(scriptPath);
            [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                const autoexecPath = path.join(dir, scriptName);
                if (fs.existsSync(autoexecPath)) fs.unlinkSync(autoexecPath);
            });

            this.updateTrayMenu();
            return { status: 'success', message: `Script "${scriptName}" deleted successfully` };
        } catch (e) {
            return { status: 'error', message: `Failed to delete script: ${e.message}` };
        }
    }

    renameScript(oldName, newName) {
        try {
            if (!newName.endsWith('.lua')) {
                newName = newName + '.lua';
            }

            newName = path.basename(newName);
            newName = newName.replace(/[^a-zA-Z0-9. _-]/g, '');

            const oldPath = path.join(this.scriptsDirectory, oldName);
            const newPath = path.join(this.scriptsDirectory, newName);

            if (!fs.existsSync(oldPath)) {
                return {
                    status: 'error',
                    message: `Script "${oldName}" not found`
                };
            }

            if (fs.existsSync(newPath) && oldName !== newName) {
                return {
                    status: 'error',
                    message: `Script "${newName}" already exists`
                };
            }

            fs.renameSync(oldPath, newPath);
            const content = fs.readFileSync(newPath, 'utf8');

            [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                const oldAutoexecPath = path.join(dir, oldName);
                const newAutoexecPath = path.join(dir, newName);

                if (fs.existsSync(oldAutoexecPath)) {
                    fs.writeFileSync(newAutoexecPath, content);
                    fs.unlinkSync(oldAutoexecPath);
                }
            });

            this.updateTrayMenu();

            return {
                status: 'success',
                message: `Script renamed from "${oldName}" to "${newName}"`
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to rename script: ${e.message}`
            };
        }
    }

    async sendAiPrompt(prompt, editorContent = "", history = []) {
        try {
            const url = "http://nitrobot.vercel.app/generate";
            const response = await axios.post(url, {
                prompt,
                context: editorContent,
                history,
                timestamp: Date.now() / 1000
            });

            if (response.status === 429) {
                return { status: 'error', message: 'Rate limit exceeded. Please wait a moment before trying again.' };
            }

            const { error, code = '', explanation = '' } = response.data;
            if (error) return { status: 'error', message: error };

            return { status: 'success', result: code.trim(), explanation: explanation.trim() };
        } catch (e) {
            const errorMessages = {
                429: 'Rate limit exceeded. Please wait a moment before trying again.',
                404: 'AI service endpoint could not be reached.',
                ECONNREFUSED: 'Connection error. Please check your internet connection.',
                ENOTFOUND: 'Connection error. Please check your internet connection.',
                ECONNABORTED: 'Request timed out. Please try again.'
            };
            
            let message = errorMessages[e.response?.status] || errorMessages[e.code];
            if (!message && e.response?.status >= 500) message = 'AI service is currently unavailable. Please try again later.';
            
            return { status: 'error', message: message || `Error: ${e.message}` };
        }
    }

    quitApp() { app.quit(); }
    minimizeApp() { this.mainWindow?.hide(); }

    getMetadata() {
        try {
            if (!fs.existsSync(this.metadataFile)) {
                return { 
                    status: 'new',
                    data: { theme: 'glassmorphism' }
                };
            }
            const data = fs.readFileSync(this.metadataFile, 'utf8');
            const metadata = JSON.parse(data);
            return { 
                status: 'success',
                data: metadata
            };
        } catch (e) {
            console.error('Error reading metadata:', e);
            return { 
                status: 'error',
                data: { theme: 'glassmorphism' }
            };
        }
    }

    saveMetadata(metadata) {
        try {
            fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
            return { status: 'success' };
        } catch (e) {
            console.error('Error saving metadata:', e);
            return { status: 'error', message: e.message };
        }
    }

    getEncryptionKey() {
        const machineId = `${process.env.USER || 'user'}-${process.platform}-nitrogen-accounts-v1`;
        return crypto.createHash('sha256').update(machineId).digest();
    }

    encryptData(data) {
        const key = this.getEncryptionKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const jsonString = JSON.stringify(data);
        let encrypted = cipher.update(jsonString, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag();
        
        return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    }

    decryptData(encryptedString) {
        try {
            const key = this.getEncryptionKey();
            const parts = encryptedString.split(':');
            
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted data format');
            }
            
            const iv = Buffer.from(parts[0], 'base64');
            const authTag = Buffer.from(parts[1], 'base64');
            const encryptedData = parts[2];
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error('Failed to decrypt data: ' + error.message);
        }
    }

    isEncrypted(content) {
        const parts = content.split(':');
        if (parts.length !== 3) return false;
        
        const base64Regex = /^[A-Za-z0-9+/]+=*$/;
        return parts.every(part => base64Regex.test(part) && part.length > 0);
    }

    loadAccounts() {
        try {
            if (fs.existsSync(this.accountsFile)) {
                const content = fs.readFileSync(this.accountsFile, 'utf8').trim();
                
                if (!content) return [];
                
                if (this.isEncrypted(content)) {
                    return this.decryptData(content);
                } else {
                    try {
                        const accounts = JSON.parse(content);
                        this.saveAccounts(accounts);
                        return accounts;
                    } catch {
                        return [];
                    }
                }
            }
        } catch (e) {
            console.error('Error loading accounts:', e);
        }
        return [];
    }

    saveAccounts(accounts) {
        try {
            const encrypted = this.encryptData(accounts);
            fs.writeFileSync(this.accountsFile, encrypted, 'utf8');
        } catch (e) {
            console.error('Error saving accounts:', e);
        }
    }

    httpsRequest(options) {
        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 403) {
                        const error = new Error('Account access forbidden');
                        error.statusCode = 403;
                        reject(error);
                    } else if (res.statusCode !== 200) {
                        const error = new Error(`Request failed: ${res.statusCode}`);
                        error.statusCode = res.statusCode;
                        reject(error);
                    } else {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            reject(new Error('Failed to parse response'));
                        }
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    async getRobloxProfile(cookie) {
        const json = await this.httpsRequest({
            hostname: 'users.roblox.com',
            path: '/v1/users/authenticated',
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return { id: json.id, name: json.name, displayName: json.displayName };
    }

    async getRobloxThumbnail(userId, size = '150x150', retries = 3) {
        const json = await this.httpsRequest({
            hostname: 'thumbnails.roblox.com',
            path: `/v1/users/avatar-bust?userIds=${userId}&size=${size}&format=Png&isCircular=true`,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!json.data?.length) throw new Error('No thumbnail data found');

        const thumbnail = json.data[0];
        if (thumbnail.state !== 'Completed') {
            if (thumbnail.state === 'Pending' && retries > 0) {
                await new Promise(r => setTimeout(r, 1500));
                return this.getRobloxThumbnail(userId, size, retries - 1);
            }
            return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
        }
        return thumbnail.imageUrl;
    }

    async getRobloxUserData(cookie) {
        try {
            const profile = await this.getRobloxProfile(cookie);
            const thumbnail = await this.getRobloxThumbnail(profile.id);
            return { ...profile, thumbnail };
        } catch (error) {
            if (error.statusCode === 403) {
                const newError = new Error('Account access forbidden (403)');
                newError.code = 'FORBIDDEN';
                throw newError;
            }
            throw error;
        }
    }

    toCocoaTimestamp(unixMillis) {
        return (unixMillis / 1000) - 978307200;
    }

    buildBinaryCookies(cookieValue) {
        const now = Date.now();
        const expirationDate = now + (30 * 24 * 60 * 60 * 1000);

        const creationTime = this.toCocoaTimestamp(now);
        const expirationTime = this.toCocoaTimestamp(expirationDate);

        const domain = '.roblox.com';
        const name = '.ROBLOSECURITY';
        const pathStr = '/';
        const value = cookieValue;

        const domainBytes = Buffer.from(domain + '\0', 'utf8');
        const nameBytes = Buffer.from(name + '\0', 'utf8');
        const pathBytes = Buffer.from(pathStr + '\0', 'utf8');
        const valueBytes = Buffer.from(value + '\0', 'utf8');

        const domainOffset = 56;
        const nameOffset = domainOffset + domainBytes.length;
        const pathOffset = nameOffset + nameBytes.length;
        const valueOffset = pathOffset + pathBytes.length;
        const cookieSize = valueOffset + valueBytes.length;

        const flags = 0x5;

        const cookieBuffer = Buffer.alloc(cookieSize);
        let offset = 0;

        cookieBuffer.writeUInt32LE(cookieSize, offset); offset += 4;
        cookieBuffer.writeUInt32LE(1, offset); offset += 4;
        cookieBuffer.writeUInt32LE(flags, offset); offset += 4;
        cookieBuffer.writeUInt32LE(0, offset); offset += 4;
        cookieBuffer.writeUInt32LE(domainOffset, offset); offset += 4;
        cookieBuffer.writeUInt32LE(nameOffset, offset); offset += 4;
        cookieBuffer.writeUInt32LE(pathOffset, offset); offset += 4;
        cookieBuffer.writeUInt32LE(valueOffset, offset); offset += 4;
        cookieBuffer.writeUInt32LE(0, offset); offset += 4;
        cookieBuffer.writeUInt32LE(0, offset); offset += 4;
        cookieBuffer.writeDoubleLE(expirationTime, offset); offset += 8;
        cookieBuffer.writeDoubleLE(creationTime, offset); offset += 8;

        domainBytes.copy(cookieBuffer, offset); offset += domainBytes.length;
        nameBytes.copy(cookieBuffer, offset); offset += nameBytes.length;
        pathBytes.copy(cookieBuffer, offset); offset += pathBytes.length;
        valueBytes.copy(cookieBuffer, offset);

        const pageHeader = Buffer.from([0x00, 0x00, 0x01, 0x00]);
        const numCookies = Buffer.alloc(4);
        numCookies.writeUInt32LE(1, 0);
        
        const cookieOffsetInPage = 12;
        const cookieOffsetBuffer = Buffer.alloc(4);
        cookieOffsetBuffer.writeUInt32LE(cookieOffsetInPage, 0);

        const pageData = Buffer.concat([
            pageHeader,
            numCookies,
            cookieOffsetBuffer,
            cookieBuffer
        ]);

        let checksum = 0;
        for (let i = 0; i < pageData.length; i += 4) {
            checksum += pageData[i];
        }

        const fileHeader = Buffer.from([0x63, 0x6F, 0x6F, 0x6B]);
        const fileFooter = Buffer.from([0x07, 0x17, 0x20, 0x05, 0x00, 0x00, 0x00, 0x4B]);
        
        const numPages = Buffer.alloc(4);
        numPages.writeUInt32BE(1, 0);
        
        const pageSize = Buffer.alloc(4);
        pageSize.writeUInt32BE(pageData.length, 0);
        
        const checksumBuffer = Buffer.alloc(4);
        checksumBuffer.writeUInt32BE(checksum, 0);

        return Buffer.concat([
            fileHeader,
            numPages,
            pageSize,
            pageData,
            checksumBuffer,
            fileFooter
        ]);
    }

    async writeRobloxCookie(cookieValue, profileId = 'default') {
        const homeDir = os.homedir();
        const cookieFile = path.join(homeDir, 'Library', 'HTTPStorages', `com.roblox.RobloxPlayer.${profileId}.binarycookies`);

        const cookiesDir = path.dirname(cookieFile);
        if (!fs.existsSync(cookiesDir)) {
            fs.mkdirSync(cookiesDir, { recursive: true });
        }

        const binaryCookies = this.buildBinaryCookies(cookieValue);
        fs.writeFileSync(cookieFile, binaryCookies);

        return cookieFile;
    }

    modifyBundleIdentifier(robloxAppPath, profileId) {
        const plistPath = path.join(robloxAppPath, 'Contents', 'Info.plist');
        if (!fs.existsSync(plistPath)) throw new Error(`Info.plist not found at: ${plistPath}`);

        let plistContent = fs.readFileSync(plistPath, 'utf8');
        const bundleIdRegex = /<key>CFBundleIdentifier<\/key>\s*<string>com\.roblox\.RobloxPlayer(\.\w+)?<\/string>/;
        const newBundleId = `<key>CFBundleIdentifier</key>\n\t<string>com.roblox.RobloxPlayer.${profileId}</string>`;

        if (!bundleIdRegex.test(plistContent)) throw new Error('Could not find CFBundleIdentifier in Info.plist');
        fs.writeFileSync(plistPath, plistContent.replace(bundleIdRegex, newBundleId), 'utf8');
    }

    resetBundleIdentifier(robloxAppPath) {
        const plistPath = path.join(robloxAppPath, 'Contents', 'Info.plist');
        if (!fs.existsSync(plistPath)) return;

        let plistContent = fs.readFileSync(plistPath, 'utf8');
        const bundleIdRegex = /<key>CFBundleIdentifier<\/key>\s*<string>com\.roblox\.RobloxPlayer(\.\w+)?<\/string>/;
        const defaultBundleId = `<key>CFBundleIdentifier</key>\n\t<string>com.roblox.RobloxPlayer</string>`;

        if (bundleIdRegex.test(plistContent)) {
            fs.writeFileSync(plistPath, plistContent.replace(bundleIdRegex, defaultBundleId), 'utf8');
        }
    }

    async getAccounts() {
        const accounts = this.loadAccounts();
        let hasUpdates = false;

        const validatedAccounts = await Promise.all(
            accounts.map(async (account) => {
                try {
                    const userData = await this.getRobloxUserData(account.cookie);
                    if (account.name !== userData.name || account.displayName !== userData.displayName || account.thumbnail !== userData.thumbnail) {
                        hasUpdates = true;
                        return { ...account, ...userData, expired: false };
                    }
                    return { ...account, expired: false };
                } catch {
                    return { ...account, expired: true };
                }
            })
        );

        if (hasUpdates) {
            this.saveAccounts(validatedAccounts.map(({ expired, ...acc }) => acc));
        }
        return validatedAccounts;
    }

    async deleteAccount(userId) {
        const accounts = this.loadAccounts().filter(acc => acc.userId !== userId);
        this.saveAccounts(accounts);
        return accounts;
    }

    async exportAccounts() {
        const accounts = this.loadAccounts();
        if (accounts.length === 0) throw new Error('No accounts to export');

        const warningResult = await dialog.showMessageBox(this.mainWindow, {
            type: 'warning',
            title: 'Security Warning',
            message: 'Exported accounts are NOT encrypted!',
            detail: 'The exported file will contain your account cookies in plain text. Anyone with this file can add and use ALL your accounts.\n\nOnly share this file with people you absolutely trust.',
            buttons: ['Cancel', 'I Understand, Export Anyway'],
            defaultId: 0,
            cancelId: 0
        });

        if (warningResult.response === 0) return { cancelled: true };

        const result = await dialog.showSaveDialog(this.mainWindow, {
            title: 'Export Accounts',
            defaultPath: 'nitrogen-accounts.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });

        if (result.canceled) return { cancelled: true };
        fs.writeFileSync(result.filePath, JSON.stringify(accounts, null, 2), 'utf8');
        return { success: true, count: accounts.length };
    }

    async importAccounts() {
        const result = await dialog.showOpenDialog(this.mainWindow, {
            title: 'Import Accounts',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile']
        });

        if (result.canceled) return { cancelled: true, imported: 0 };

        const importedAccounts = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
        if (!Array.isArray(importedAccounts)) throw new Error('Invalid file format: expected an array of accounts');

        const existingAccounts = this.loadAccounts();
        const existingUserIds = new Set(existingAccounts.map(acc => acc.userId));
        const newAccounts = importedAccounts.filter(acc => acc.userId && acc.cookie && !existingUserIds.has(acc.userId));

        if (newAccounts.length > 0) {
            this.saveAccounts([...existingAccounts, ...newAccounts]);
        }
        return { imported: newAccounts.length };
    }

    async killAllRoblox() {
        return new Promise((resolve) => {
            exec('pgrep -x RobloxPlayer', (error, stdout) => {
                if (error || !stdout.trim()) return resolve({ count: 0 });

                const count = stdout.trim().split('\n').filter(p => p).length;
                exec('killall -9 RobloxPlayer 2>/dev/null; killall -9 Roblox 2>/dev/null', () => resolve({ count }));
            });
        });
    }

    async launchAccount(userId) {
        const accounts = this.loadAccounts();
        const account = accounts.find(acc => acc.userId === userId);
        if (!account) throw new Error('Account not found');

        const robloxPaths = ['/Applications/Roblox.app', path.join(process.env.HOME, 'Applications', 'Roblox.app')];
        const robloxPath = robloxPaths.find(p => fs.existsSync(p));
        if (!robloxPath) throw new Error('Roblox not found. Please install Roblox first.');

        await this.writeRobloxCookie(account.cookie, String(userId));

        return new Promise((resolve, reject) => {
            try {
                this.modifyBundleIdentifier(robloxPath, String(userId));
            } catch (err) {
                return reject(new Error(`Failed to modify bundle identifier: ${err.message}`));
            }

            exec(`xattr -cr "${robloxPath}" && codesign --force --deep --sign - "${robloxPath}" 2>/dev/null || true`, () => {
                const execPath = path.join(robloxPath, 'Contents', 'MacOS', 'RobloxPlayer');
                if (!fs.existsSync(execPath)) return reject(new Error('RobloxPlayer executable not found'));

                try {
                    const child = spawn(execPath, [], { detached: true, stdio: 'ignore' });
                    child.unref();
                    setTimeout(() => { try { this.resetBundleIdentifier(robloxPath); } catch {} }, 5000);
                    resolve({ success: true, pid: child.pid });
                } catch (err) {
                    reject(new Error(`Failed to launch Roblox: ${err.message}`));
                }
            });
        });
    }

    async openAccountWebsite(userId) {
        const accounts = this.loadAccounts();
        const account = accounts.find(acc => acc.userId === userId);
        if (!account) throw new Error('Account not found');

        const webSession = session.fromPartition(`website-${userId}`, { cache: true });
        await webSession.cookies.set({
            url: 'https://www.roblox.com',
            name: '.ROBLOSECURITY',
            value: account.cookie,
            domain: '.roblox.com',
            path: '/',
            secure: true,
            httpOnly: true
        });

        const webWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            parent: this.mainWindow,
            webPreferences: { session: webSession, nodeIntegration: false, contextIsolation: true }
        });
        webWindow.loadURL('https://www.roblox.com');
        return { success: true };
    }

    async openLoginWindow() {
        return new Promise((resolve) => {
            const loginSession = session.fromPartition('login-session', { cache: false });

            const loginWindow = new BrowserWindow({
                width: 800,
                height: 700,
                parent: this.mainWindow,
                modal: true,
                webPreferences: { session: loginSession, nodeIntegration: false, contextIsolation: true }
            });

            loginSession.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            loginSession.clearStorageData({ storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage', 'serviceworkers'] });

            const checkCookie = async () => {
                try {
                    const cookies = await loginSession.cookies.get({ domain: '.roblox.com', name: '.ROBLOSECURITY' });
                    if (cookies.length > 0) {
                        const robloSecurity = cookies[0].value;
                        let userData;
                        try {
                            userData = await this.getRobloxUserData(robloSecurity);
                        } catch (err) {
                            loginWindow.close();
                            resolve({ error: { type: err.code === 'FORBIDDEN' ? 'forbidden' : 'unknown', message: err.message } });
                            return;
                        }

                        const accounts = this.loadAccounts();
                        const existingIndex = accounts.findIndex(acc => acc.userId === userData.id);
                        
                        const newAccount = {
                            cookie: robloSecurity,
                            userId: userData.id,
                            name: userData.name,
                            displayName: userData.displayName,
                            thumbnail: userData.thumbnail,
                            addedAt: new Date().toISOString()
                        };
                        
                        if (existingIndex >= 0) {
                            accounts[existingIndex] = newAccount;
                        } else {
                            accounts.push(newAccount);
                        }
                        
                        this.saveAccounts(accounts);
                        loginWindow.close();
                        resolve(newAccount);
                    }
                } catch {}
            };

            const cookieCheckInterval = setInterval(checkCookie, 500);
            loginWindow.loadURL('https://www.roblox.com/login');

            loginWindow.webContents.on('did-finish-load', () => {
                loginWindow.webContents.executeJavaScript(`
                    document.getElementById('header')?.remove();
                    document.getElementById('footer-container')?.remove();
                    const loginBtn = document.getElementById('login-button');
                    if (loginBtn) loginBtn.textContent = 'Add Account';
                    const header = document.querySelector('.login-header');
                    if (header) header.textContent = 'Nitrogen';
                    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
                    new MutationObserver(() => {
                        const btn = document.getElementById('login-button');
                        if (btn && btn.textContent !== 'Add Account') btn.textContent = 'Add Account';
                        const h = document.querySelector('.login-header');
                        if (h && h.textContent !== 'Nitrogen') h.textContent = 'Nitrogen';
                        document.getElementById('footer-container')?.remove();
                    }).observe(document.body, { childList: true, subtree: true, characterData: true });
                `).catch(() => {});
            });

            loginWindow.on('closed', () => {
                clearInterval(cookieCheckInterval);
                loginSession.clearStorageData({ storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage', 'serviceworkers'] });
                resolve(null);
            });
        });
    }


    startLogMonitoring() {
        try {
            const logDir = path.join(os.homedir(), 'Library/Logs/Roblox');
            
            if (!fs.existsSync(logDir)) {
                this.sendToRenderer('updateConsoleOutput', `Roblox logs directory not found: ${logDir}`);
                return { status: 'error', message: 'Roblox logs directory not found' };
            }

            if (this.logMonitorInterval) {
                this.stopLogMonitoring();
            }

            this.sendToRenderer('updateConsoleOutput', 'Starting log monitoring...');
            
            let currentLogFile = null;
            let fileSize = 0;
            let lastFileCheck = 0;
            const fileCheckInterval = 5000;
            let logBuffer = [];
            let lastUpdateTime = Date.now();
            const updateInterval = 300;
            
            this.logMonitorInterval = setInterval(() => {
                try {
                    const currentTime = Date.now();
                    
                    if (currentTime - lastFileCheck >= fileCheckInterval) {
                        try {
                            const files = fs.readdirSync(logDir)
                                .filter(f => {
                                    const fullPath = path.join(logDir, f);
                                    return fs.statSync(fullPath).isFile() && !f.startsWith('.');
                                });
                            
                            if (files.length === 0) {
                                lastFileCheck = currentTime;
                                return;
                            }
                            
                            files.sort((a, b) => {
                                const aPath = path.join(logDir, a);
                                const bPath = path.join(logDir, b);
                                return fs.statSync(bPath).mtime.getTime() - fs.statSync(aPath).mtime.getTime();
                            });
                            
                            const latestLogFile = path.join(logDir, files[0]);
                            
                            if (latestLogFile !== currentLogFile) {
                                currentLogFile = latestLogFile;
                                fileSize = fs.existsSync(currentLogFile) ? fs.statSync(currentLogFile).size : 0;
                                this.sendToRenderer('updateConsoleOutput', `Monitoring new logs from: ${path.basename(currentLogFile)}`);
                            }
                        } catch (e) {
                            this.sendToRenderer('updateConsoleOutput', `Error checking log files: ${e.message}`);
                            setTimeout(() => {}, 2000);
                        }
                        lastFileCheck = currentTime;
                    }
                    
                    if (currentLogFile && fs.existsSync(currentLogFile)) {
                        try {
                            const currentStats = fs.statSync(currentLogFile);
                            const currentSize = currentStats.size;
                            
                            if (currentSize > fileSize) {
                                const chunkSize = 1024 * 1024;
                                const readSize = currentSize - fileSize > chunkSize ? chunkSize : currentSize - fileSize;
                                
                                const buffer = Buffer.alloc(readSize);
                                const fd = fs.openSync(currentLogFile, 'r');
                                
                                try {
                                    const bytesRead = fs.readSync(fd, buffer, 0, readSize, fileSize);
                                    const newContent = buffer.subarray(0, bytesRead).toString('utf8');
                                    
                                    fileSize = fs.statSync(currentLogFile).size;
                                    
                                    const lines = newContent.split('\n');
                                    for (const line of lines) {
                                        if (line.trim()) {
                                            let message = line;
                                            const match = line.match(/\s{2,}(.*)$/);
                                            if (match && match[1]) {
                                                message = match[1];
                                            }
                                            logBuffer.push(`[Output]: ${message}`);
                                        }
                                    }
                                } finally {
                                    fs.closeSync(fd);
                                }
                            }
                        } catch (e) {
                            logBuffer.push(`Error reading log file: ${e.message}`);
                        }
                    }
                    
                    if (logBuffer.length > 0 && (currentTime - lastUpdateTime >= updateInterval)) {
                        try {
                            let toSend;
                            if (logBuffer.length > 100) {
                                toSend = logBuffer.slice(-100);
                                logBuffer = [];
                            } else {
                                toSend = [...logBuffer];
                                logBuffer = [];
                            }
                            
                            if (toSend.length > 0) {
                                this.sendToRenderer('batchUpdateConsole', toSend);
                            }
                            
                            lastUpdateTime = currentTime;
                        } catch (e) {
                            console.error('Error updating console:', e);
                        }
                    }
                } catch (e) {
                    console.error('Log monitoring error:', e);
                    this.sendToRenderer('updateConsoleOutput', `Log monitoring error: ${e.message}`);
                }
            }, logBuffer.length === 0 ? this.logRefreshRate * 1000 : Math.min(100, (this.logRefreshRate * 1000) / 2));
            
            return { status: 'success', message: 'Log monitoring started' };
        } catch (e) {
            return { status: 'error', message: `Failed to start log monitoring: ${e.message}` };
        }
    }

    stopLogMonitoring() {
        if (this.logMonitorInterval) {
            clearInterval(this.logMonitorInterval);
            this.logMonitorInterval = null;
        }
    }

    setLogRefreshRate(rate) {
        this.logRefreshRate = Math.max(parseFloat(rate) || 0.5, 0.1);
        return { status: 'success', message: `Log refresh rate set to ${this.logRefreshRate}` };
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow?.webContents && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    setupTray() {
        this.tray = new Tray(nativeImage.createEmpty());
        this.tray.setTitle('N₂');
        this.tray.setToolTip('Nitrogen Direct');
        this.lastTrayMenu = null;
        this.updateTrayMenu();
    }

    updateTrayMenu() {
        const scripts = [];
        if (fs.existsSync(this.scriptsDirectory)) {
            const scriptFiles = fs.readdirSync(this.scriptsDirectory).filter(file => file.endsWith('.lua'));
            scripts.push(...scriptFiles);
        }

        const template = [
            {
                label: 'Nitrogen Direct',
                enabled: false
            },
            { type: 'separator' }
        ];

        if (scripts.length > 0) {
            scripts.sort().forEach(scriptName => {
                template.push({
                    label: scriptName,
                    click: async () => {
                        try {
                            const scriptPath = path.join(this.scriptsDirectory, scriptName);
                            if (fs.existsSync(scriptPath)) {
                                const scriptContent = fs.readFileSync(scriptPath, 'utf8');
                                const result = await this.executeScript(scriptContent);
                                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                    this.mainWindow.webContents.send('script-executed-from-tray', {
                                        script: scriptName,
                                        result: result
                                    });
                                }
                            }
                        } catch (e) {
                            console.error(`Error executing script from tray: ${e.message}`);
                        }
                    }
                });
            });
        } else {
            template.push({
                label: 'No scripts found',
                enabled: false
            });
        }

        template.push(
            { type: 'separator' },
            {
                label: 'Open Nitrogen',
                click: () => {
                    if (this.mainWindow) {
                        this.mainWindow.show();
                        this.mainWindow.focus();
                        if (this.mainWindow.isMinimized()) {
                            this.mainWindow.restore();
                        }
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        );

        const contextMenu = Menu.buildFromTemplate(template);
        this.tray.setContextMenu(contextMenu);
        this.lastTrayMenu = contextMenu;
    }
}

let nitrogenAPI;

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 680,
        frame: false,
        vibrancy: 'fullscreen-ui',
        visualEffectState: 'active',
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: !app.isPackaged,
            webSecurity: false
        }
    });

    nitrogenAPI.mainWindow = mainWindow;
    mainWindow.loadFile('index.html');

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.executeJavaScript(`
            const header = document.querySelector('.header');
            if (header) {
                header.style.webkitAppRegion = 'drag';
                
                const buttons = header.querySelectorAll('button, .minimize-app-btn, .close-app-btn, .window-controls');
                buttons.forEach(btn => {
                    btn.style.webkitAppRegion = 'no-drag';
                });
            }
        `);
    });

    return mainWindow;
}


app.whenReady().then(async () => {
    nitrogenAPI = new NitrogenAPI();

    try {
        const latestVersion = await nitrogenAPI.getLatestVersion();
        if (latestVersion === null) {
            console.log('Unable to check for updates - offline or connection error');
        } else if (latestVersion > getAppVersion()) {
            const { dialog } = require('electron');
            const choice = await dialog.showMessageBox({
                type: 'info',
                buttons: ['Update Now', 'Skip'],
                title: 'Update Available',
                message: `Nitrogen has an update available (${latestVersion}). Would you like to update?`,
                detail: 'Click "Update Now" to update automatically via the install script.'
            });

            if (choice.response === 0) {
                const updateProcess = spawn('bash', ['-c', 'curl -fsSL https://raw.githubusercontent.com/JadXV/Nitrogen/refs/heads/main/install.sh | bash'], {
                    stdio: 'inherit',
                    detached: true
                });
                updateProcess.on('error', (err) => {
                    console.error('Failed to start update process:', err);
                });
                app.quit();
            }
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }

    const mainWindow = createWindow();
    nitrogenAPI.setupTray();

    globalShortcut.register('CommandOrControl+.', () => {
        if (nitrogenAPI && nitrogenAPI.tray && nitrogenAPI.lastTrayMenu) {
            nitrogenAPI.tray.popUpContextMenu(nitrogenAPI.lastTrayMenu);
        }
    });

    ipcMain.handle('get-version', () => nitrogenAPI.getVersion());
    ipcMain.handle('open-scripts-folder', () => nitrogenAPI.openScriptsFolder());
    ipcMain.handle('execute-script', (event, scriptContent) => nitrogenAPI.executeScript(scriptContent));
    ipcMain.handle('execute-script-on-port', (event, scriptContent, targetPort) => nitrogenAPI.executeScriptOnPort(scriptContent, targetPort));
    ipcMain.handle('check-port-status', () => nitrogenAPI.checkPortStatus());
    ipcMain.handle('get-game-name', (event, universeId) => nitrogenAPI.getGameName(universeId));
    ipcMain.handle('get-scripts', (event, script) => nitrogenAPI.getScripts(script));
    ipcMain.handle('open-roblox', () => nitrogenAPI.openRoblox());
    ipcMain.handle('join-website', () => nitrogenAPI.joinWebsite());
    ipcMain.handle('save-script', (event, name, content, autoExec) => nitrogenAPI.saveScript(name, content, autoExec));
    ipcMain.handle('toggle-autoexec', (event, scriptName, enabled) => nitrogenAPI.toggleAutoExec(scriptName, enabled));
    ipcMain.handle('get-local-scripts', () => nitrogenAPI.getLocalScripts());
    ipcMain.handle('delete-script', (event, scriptName) => nitrogenAPI.deleteScript(scriptName));
    ipcMain.handle('rename-script', (event, oldName, newName) => nitrogenAPI.renameScript(oldName, newName));
    ipcMain.handle('send-ai-prompt', (event, prompt, editorContent, history) => nitrogenAPI.sendAiPrompt(prompt, editorContent, history));
    ipcMain.handle('quit-app', () => nitrogenAPI.quitApp());
    ipcMain.handle('minimize-app', () => nitrogenAPI.minimizeApp());
    ipcMain.handle('get-latest-release-info', () => nitrogenAPI.getLatestReleaseInfo());
    ipcMain.handle('start-log-monitoring', () => nitrogenAPI.startLogMonitoring());
    ipcMain.handle('set-log-refresh-rate', (event, rate) => nitrogenAPI.setLogRefreshRate(rate));
    ipcMain.handle('get-metadata', () => nitrogenAPI.getMetadata());
    ipcMain.handle('save-metadata', (event, metadata) => nitrogenAPI.saveMetadata(metadata));
    
    ipcMain.handle('get-accounts', () => nitrogenAPI.getAccounts());
    ipcMain.handle('delete-account', (event, userId) => nitrogenAPI.deleteAccount(userId));
    ipcMain.handle('export-accounts', () => nitrogenAPI.exportAccounts());
    ipcMain.handle('import-accounts', () => nitrogenAPI.importAccounts());
    ipcMain.handle('kill-all-roblox', () => nitrogenAPI.killAllRoblox());
    ipcMain.handle('launch-account', (event, userId) => nitrogenAPI.launchAccount(userId));
    ipcMain.handle('open-account-website', (event, userId) => nitrogenAPI.openAccountWebsite(userId));
    ipcMain.handle('open-login-window', () => nitrogenAPI.openLoginWindow());

    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-close', () => {
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });
});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (nitrogenAPI && nitrogenAPI.tray) {
        nitrogenAPI.tray.destroy();
        globalShortcut.unregisterAll();
    }
});
