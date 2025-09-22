const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const net = require('net');
const { spawn, exec } = require('child_process');
const zlib = require('zlib');

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
    }

    syncAutoexecFolders() {
        try {
            const hydrogenExists = fs.existsSync(this.hydrogenAutoexecDir);
            const macsploitExists = fs.existsSync(this.macsploitAutoexecDir);
            const opiumwareExists = fs.existsSync(this.opiumwareAutoexecDir);

            if (!hydrogenExists && !macsploitExists && !opiumwareExists) {
                return;
            }

            const hydrogenScripts = {};
            const macsploitScripts = {};
            const opiumwareScripts = {};

            if (hydrogenExists) {
                fs.readdirSync(this.hydrogenAutoexecDir)
                    .filter(file => file.endsWith('.lua'))
                    .forEach(filename => {
                        try {
                            const filePath = path.join(this.hydrogenAutoexecDir, filename);
                            hydrogenScripts[filename] = fs.readFileSync(filePath, 'utf8');
                        } catch (e) {
                            console.error(`Error reading Hydrogen script ${filename}: ${e.message}`);
                        }
                    });
            }

            if (macsploitExists) {
                fs.readdirSync(this.macsploitAutoexecDir)
                    .filter(file => file.endsWith('.lua'))
                    .forEach(filename => {
                        try {
                            const filePath = path.join(this.macsploitAutoexecDir, filename);
                            macsploitScripts[filename] = fs.readFileSync(filePath, 'utf8');
                        } catch (e) {
                            console.error(`Error reading MacSploit script ${filename}: ${e.message}`);
                        }
                    });
            }

            if (opiumwareExists) {
                fs.readdirSync(this.opiumwareAutoexecDir)
                    .filter(file => file.endsWith('.lua'))
                    .forEach(filename => {
                        try {
                            const filePath = path.join(this.opiumwareAutoexecDir, filename);
                            opiumwareScripts[filename] = fs.readFileSync(filePath, 'utf8');
                        } catch (e) {
                            console.error(`Error reading OpiumWare script ${filename}: ${e.message}`);
                        }
                    });
            }

            const allScripts = { ...hydrogenScripts, ...macsploitScripts, ...opiumwareScripts };

            for (const [scriptName, content] of Object.entries(allScripts)) {
                if (hydrogenExists) {
                    const hydrogenPath = path.join(this.hydrogenAutoexecDir, scriptName);
                    if (!fs.existsSync(hydrogenPath)) {
                        try {
                            fs.writeFileSync(hydrogenPath, content);
                        } catch (e) {
                            console.error(`Error syncing ${scriptName} to Hydrogen: ${e.message}`);
                        }
                    }
                }

                if (macsploitExists) {
                    const macsploitPath = path.join(this.macsploitAutoexecDir, scriptName);
                    if (!fs.existsSync(macsploitPath)) {
                        try {
                            fs.writeFileSync(macsploitPath, content);
                        } catch (e) {
                            console.error(`Error syncing ${scriptName} to MacSploit: ${e.message}`);
                        }
                    }
                }

                if (opiumwareExists) {
                    const opiumwarePath = path.join(this.opiumwareAutoexecDir, scriptName);
                    if (!fs.existsSync(opiumwarePath)) {
                        try {
                            fs.writeFileSync(opiumwarePath, content);
                        } catch (e) {
                            console.error(`Error syncing ${scriptName} to OpiumWare: ${e.message}`);
                        }
                    }
                }
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
            const response = await axios.get('https://api.github.com/repos/JadXV/Nitrogen/releases/latest');
            if (response.status === 200) {
                const releaseData = response.data;
                return {
                    status: 'success',
                    version: releaseData.tag_name || 'Unknown',
                    name: releaseData.name || 'Latest Release',
                    description: releaseData.body || 'No changelog available.',
                    published_at: releaseData.published_at || '',
                    html_url: releaseData.html_url || 'https://github.com/JadXV/Nitrogen/releases'
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

    getVersion() {
        return { version: getAppVersion() };
    }

    openScriptsFolder() {
        try {
            shell.openPath(this.scriptsDirectory);
        } catch (e) {
            console.error(`Error opening scripts folder: ${e.message}`);
        }
    }

    async executeScript(scriptContent) {
        const HYDRO_START = 6969;
        const HYDRO_END = 7069;
        const MACSPLOIT_START = 5553;
        const MACSPLOIT_END = 5563;
        const OPIUM_START = 8392;
        const OPIUM_END = 8397;
        let serverPort = null;
        const messages = [];

        // Try Hydrogen first
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
                        message: 'Script executed successfully via Hydrogen',
                        details: messages
                    };
                }
            }
        } catch (e) {
            // Continue to try other executors
        }

        // Try OpiumWare second
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
                    message: `Script executed successfully via OpiumWare on port ${port}`,
                    details: messages
                };
            } catch (e) {
                continue;
            }
        }

        // Try MacSploit last
        for (let port = MACSPLOIT_START; port <= MACSPLOIT_END; port++) {
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
                continue;
            }
        }

        // If all executors failed
        return {
            status: 'error',
            message: 'Error: No compatible executor detected. Make sure Roblox is running and a compatible executor is installed.',
            details: messages
        };
    }

    async getGameName(universeId) {
        try {
            const gameInfoUrl = `https://games.roblox.com/v1/games?universeIds=${universeId}`;
            const response = await axios.get(gameInfoUrl);
            
            if (response.status === 200) {
                const gameData = response.data;
                if (gameData && gameData.data && gameData.data.length > 0) {
                    const gameName = gameData.data[0].name;
                    return {
                        status: 'success',
                        game_name: gameName
                    };
                }
            }

            return {
                status: 'error',
                message: 'Game not found'
            };
        } catch (e) {
            return {
                status: 'error',
                message: e.message
            };
        }
    }

    async getScripts(script) {
        try {
            let url;
            if (script === "") {
                url = "https://scriptblox.com/api/script/fetch";
            } else {
                url = `https://scriptblox.com/api/script/search?q=${encodeURIComponent(script)}`;
            }

            const response = await axios.get(url);
            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.data}`);
            }
        } catch (e) {
            return {
                status: 'error',
                message: e.message
            };
        }
    }

    async openRoblox() {
        try {
            const { stdout } = await new Promise((resolve, reject) => {
                exec("ps aux | grep Roblox | grep -v grep", (error, stdout, stderr) => {
                    if (error && error.code !== 1) {
                        reject(error);
                    } else {
                        resolve({ stdout });
                    }
                });
            });

            const robloxProcesses = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => line.split(/\s+/)[1])
                .filter(pid => pid);

            if (robloxProcesses.length > 1) {
                const choice = await dialog.showMessageBox(this.mainWindow, {
                    type: 'warning',
                    buttons: ['Open New Instance', 'Quit All Roblox Processes', 'Cancel'],
                    defaultId: 0,
                    cancelId: 2,
                    title: 'Multiple Roblox Instances',
                    message: 'If you want to use proper multi-instances of Roblox properly:\n\n• Set scripts you want to use as auto-execute\n• Play your game on the first client\n• For additional instances, log out, log into a different account, then join the game\n• Repeat for more instances as needed'
                });

                if (choice.response === 0) {
                    spawn('/Applications/Roblox.app/Contents/MacOS/RobloxPlayer', [], {
                        stdio: 'ignore',
                        detached: true
                    });
                    return {
                        status: 'success',
                        message: 'Roblox instance launched successfully'
                    };
                } else if (choice.response === 1) {
                    for (const pid of robloxProcesses) {
                        exec(`kill -9 ${pid}`);
                    }
                    return {
                        status: 'success',
                        message: 'All Roblox processes have been closed'
                    };
                } else {
                    return {
                        status: 'cancelled',
                        message: 'Operation cancelled'
                    };
                }
            } else {
                shell.openExternal('roblox://');
                return {
                    status: 'success',
                    message: 'Roblox launched successfully'
                };
            }
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to open Roblox: ${e.message}`
            };
        }
    }

    joinWebsite() {
        try {
            shell.openExternal('https://nitrogen.lol');
            return {
                status: 'success',
                message: 'Website opened successfully'
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to open website: ${e.message}`
            };
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

            if (autoExec) {
                if (fs.existsSync(this.hydrogenAutoexecDir)) {
                    fs.writeFileSync(path.join(this.hydrogenAutoexecDir, name), content);
                }
                if (fs.existsSync(this.macsploitAutoexecDir)) {
                    fs.writeFileSync(path.join(this.macsploitAutoexecDir, name), content);
                }
                if (fs.existsSync(this.opiumwareAutoexecDir)) {
                    fs.writeFileSync(path.join(this.opiumwareAutoexecDir, name), content);
                }
            } else {
                [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                    const autoexecPath = path.join(dir, name);
                    if (fs.existsSync(autoexecPath)) {
                        fs.unlinkSync(autoexecPath);
                    }
                });
            }

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
                return {
                    status: 'error',
                    message: `Script ${scriptName} not found`
                };
            }

            if (enabled) {
                const content = fs.readFileSync(scriptPath, 'utf8');

                [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                    if (fs.existsSync(dir)) {
                        fs.writeFileSync(path.join(dir, scriptName), content);
                    }
                });
            } else {
                [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                    const autoexecPath = path.join(dir, scriptName);
                    if (fs.existsSync(autoexecPath)) {
                        fs.unlinkSync(autoexecPath);
                    }
                });
            }

            return {
                status: 'success',
                message: `Auto-execute ${enabled ? 'enabled' : 'disabled'} for ${scriptName}`
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to update auto-execute status: ${e.message}`
            };
        }
    }

    getLocalScripts() {
        try {
            if (!fs.existsSync(this.scriptsDirectory)) {
                fs.mkdirSync(this.scriptsDirectory, { recursive: true });
            }

            const files = [];
            const scriptFiles = fs.readdirSync(this.scriptsDirectory).filter(file => file.endsWith('.lua'));

            for (const filename of scriptFiles) {
                try {
                    const filePath = path.join(this.scriptsDirectory, filename);
                    const content = fs.readFileSync(filePath, 'utf8');

                    const autoExec = [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir]
                        .some(dir => fs.existsSync(path.join(dir, filename)));

                    files.push({
                        name: filename,
                        path: filePath,
                        content: content,
                        autoExec: autoExec
                    });
                } catch (e) {
                    console.error(`Error reading file ${filename}: ${e.message}`);
                }
            }

            return {
                status: 'success',
                scripts: files
            };
        } catch (e) {
            return {
                status: 'error',
                message: e.message
            };
        }
    }

    deleteScript(scriptName) {
        try {
            const scriptPath = path.join(this.scriptsDirectory, scriptName);

            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'error',
                    message: `Script "${scriptName}" not found`
                };
            }

            fs.unlinkSync(scriptPath);

            [this.hydrogenAutoexecDir, this.macsploitAutoexecDir, this.opiumwareAutoexecDir].forEach(dir => {
                const autoexecPath = path.join(dir, scriptName);
                if (fs.existsSync(autoexecPath)) {
                    fs.unlinkSync(autoexecPath);
                }
            });

            this.updateTrayMenu();

            return {
                status: 'success',
                message: `Script "${scriptName}" deleted successfully`
            };
        } catch (e) {
            return {
                status: 'error',
                message: `Failed to delete script: ${e.message}`
            };
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

            const content = fs.readFileSync(oldPath, 'utf8');
            fs.renameSync(oldPath, newPath);

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

    async sendAiPrompt(prompt, editorContent = "") {
        try {
            const currentTime = Date.now() / 1000;
            const url = "http://nitrobot.vercel.app/generate";
            const payload = {
                prompt: prompt,
                context: editorContent,
                timestamp: currentTime
            };

            const response = await axios.post(url, payload);

            if (response.status === 429) {
                return {
                    status: 'error',
                    message: 'Rate limit exceeded. Please wait a moment before trying again.'
                };
            }

            const responseJson = response.data;

            if (responseJson.error) {
                return {
                    status: 'error',
                    message: responseJson.error
                };
            }

            const code = responseJson.code || '';
            const explanation = responseJson.explanation || '';

            return {
                status: 'success',
                result: code.trim(),
                explanation: explanation.trim()
            };
        } catch (e) {
            if (e.response) {
                const statusCode = e.response.status;
                let errorMessage;

                if (statusCode === 429) {
                    errorMessage = "Rate limit exceeded. Please wait a moment before trying again.";
                } else if (statusCode === 404) {
                    errorMessage = "AI service endpoint could not be reached.";
                } else if (statusCode >= 500) {
                    errorMessage = "AI service is currently unavailable. Please try again later.";
                } else {
                    errorMessage = `HTTP Error ${statusCode}: ${e.message}`;
                }

                return {
                    status: 'error',
                    message: errorMessage
                };
            } else if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
                return {
                    status: 'error',
                    message: 'Connection error. Please check your internet connection.'
                };
            } else if (e.code === 'ECONNABORTED') {
                return {
                    status: 'error',
                    message: 'Request timed out. Please try again.'
                };
            } else {
                return {
                    status: 'error',
                    message: `Error: ${e.message}`
                };
            }
        }
    }

    quitApp() {
        app.quit();
    }

    minimizeApp() {
        if (this.mainWindow) {
            this.mainWindow.hide();
        }
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
        try {
            this.logRefreshRate = parseFloat(rate);
            if (this.logRefreshRate <= 0) {
                this.logRefreshRate = 0.5; 
            }
            return { status: 'success', message: `Log refresh rate set to ${this.logRefreshRate}` };
        } catch (e) {
            return { status: 'error', message: `Failed to set log refresh rate: ${e.message}` };
        }
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
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
    ipcMain.handle('get-game-name', (event, universeId) => nitrogenAPI.getGameName(universeId));
    ipcMain.handle('get-scripts', (event, script) => nitrogenAPI.getScripts(script));
    ipcMain.handle('open-roblox', () => nitrogenAPI.openRoblox());
    ipcMain.handle('join-website', () => nitrogenAPI.joinWebsite());
    ipcMain.handle('save-script', (event, name, content, autoExec) => nitrogenAPI.saveScript(name, content, autoExec));
    ipcMain.handle('toggle-autoexec', (event, scriptName, enabled) => nitrogenAPI.toggleAutoExec(scriptName, enabled));
    ipcMain.handle('get-local-scripts', () => nitrogenAPI.getLocalScripts());
    ipcMain.handle('delete-script', (event, scriptName) => nitrogenAPI.deleteScript(scriptName));
    ipcMain.handle('rename-script', (event, oldName, newName) => nitrogenAPI.renameScript(oldName, newName));
    ipcMain.handle('send-ai-prompt', (event, prompt, editorContent) => nitrogenAPI.sendAiPrompt(prompt, editorContent));
    ipcMain.handle('quit-app', () => nitrogenAPI.quitApp());
    ipcMain.handle('minimize-app', () => nitrogenAPI.minimizeApp());
    ipcMain.handle('get-latest-release-info', () => nitrogenAPI.getLatestReleaseInfo());
    ipcMain.handle('start-log-monitoring', () => nitrogenAPI.startLogMonitoring());
    ipcMain.handle('set-log-refresh-rate', (event, rate) => nitrogenAPI.setLogRefreshRate(rate));

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
