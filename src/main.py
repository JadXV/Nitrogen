import webview
import requests
import os
import time
import threading
import json
from datetime import datetime
import objc
from AppKit import NSApp, NSAlert, NSStatusBar, NSMenu, NSMenuItem, NSVariableStatusItemLength, NSObject, NSApplication
from AppKit import NSPasteboard, NSStringPboardType

BACKEND_VERSION = "v4.0"

def get_latest_version():
    try:
        response = requests.head('https://github.com/JadXV/Nitrogen/releases/latest', allow_redirects=True)
        final_url = response.url
        latest_version = final_url.split('/tag/')[1] if '/tag/' in final_url else None
        return latest_version
    except Exception as e:
        print(f"Error getting latest version: {str(e)}")
        return None
    
latest_version = get_latest_version()
if latest_version > BACKEND_VERSION:
    alert = NSAlert.alloc().init()
    alert.setMessageText_("Nitrogen Update Available")
    alert.setInformativeText_(f"A new version of Nitrogen is available!\n\nCurrent version: {BACKEND_VERSION}\nNew version: {latest_version}\n\nWould you like to update now?")
    alert.addButtonWithTitle_("Install Update")
    alert.addButtonWithTitle_("Not Now")
    alert.setAlertStyle_(0)

    result = alert.runModal()
    if result == 1000:
        os.system("curl -fsSL https://raw.githubusercontent.com/JadXV/Nitrogen/refs/heads/main/install.sh | bash")
        success_alert = NSAlert.alloc().init()
        success_alert.setMessageText_("Update Complete")
        success_alert.setInformativeText_(f"Nitrogen has been updated to version {latest_version}.\n\nPlease restart the application to apply the changes.")
        success_alert.addButtonWithTitle_("OK")
        success_alert.setAlertStyle_(0)
        success_alert.runModal()
        exit(0)

class API:
    def __init__(self):
        self.log_thread = None
        self.stop_log_monitoring = False
        self.log_refresh_rate = 0.5 
        self.window = None
        self.directory = os.path.join(os.path.expanduser('~'), 'Nitrogen')
        self.scripts_directory = os.path.join(self.directory, 'scripts')
        self.hydrogen_autoexec_dir = os.path.join(os.path.expanduser('~'), 'Hydrogen', 'autoexecute')
        self.metadata_file = os.path.join(self.directory, 'metadata.json')

        if not os.path.exists(self.directory):
            os.makedirs(self.directory)
            
        if not os.path.exists(self.scripts_directory):
            os.makedirs(self.scripts_directory)
            
        if not os.path.exists(self.hydrogen_autoexec_dir):
            os.makedirs(self.hydrogen_autoexec_dir)
            
        if not os.path.exists(self.metadata_file):
            self._initialize_metadata()

    def _initialize_metadata(self):
        default_metadata = {
            "theme": "glassmorphism"
        }
        try:
            with open(self.metadata_file, 'w') as f:
                json.dump(default_metadata, f, indent=2)
            print(f"Initialized metadata file with default settings")
        except Exception as e:
            print(f"Error initializing metadata file: {str(e)}")

    def save_theme(self, theme):
        try:
            metadata = {}
            if os.path.exists(self.metadata_file):
                try:
                    with open(self.metadata_file, 'r') as f:
                        metadata = json.load(f) 
                except Exception as e:
                    print(f"Error reading metadata file, creating new: {str(e)}")
                    metadata = {}
            
            metadata["theme"] = theme
            
            with open(self.metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            print(f"Theme saved: {theme}")
            return {"status": "success", "theme": theme}
        except Exception as e:
            print(f"Error saving theme: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    def get_theme(self):
        try:
            if os.path.exists(self.metadata_file):
                with open(self.metadata_file, 'r') as f:
                    metadata = json.load(f)
                    theme = metadata.get("theme", "glassmorphism")
                    print(f"Retrieved theme from metadata: {theme}")
                    return {"status": "success", "theme": theme}
            
            print("Metadata file not found, returning glassmorphism theme")
            return {"status": "success", "theme": "glassmorphism"}
        except Exception as e:
            print(f"Error getting theme: {str(e)}")
            return {"status": "success", "theme": "glassmorphism"}
    
    def get_version(self):
        return {"version": BACKEND_VERSION}
    
    def open_workspace_folder(self):
        try:
            workspace_path = os.path.join(os.path.expanduser('~'), 'Hydrogen', 'workspace')
            if not os.path.exists(workspace_path):
                os.makedirs(workspace_path)
            os.system(f"open '{workspace_path}'")
        except Exception as e:
            print(f"Error opening workspace folder: {str(e)}")
    
    def open_scripts_folder(self):
        try:
            os.system(f"open '{self.scripts_directory}'")
        except Exception as e:
            print(f"Error opening scripts folder: {str(e)}")

    def execute_script(self, script_content):
        START_PORT = 6969
        END_PORT = 7069
        server_port = None
        messages = []

        try:
            for port in range(START_PORT, END_PORT + 1):
                url = f"http://127.0.0.1:{port}/secret"
                try:
                    res = requests.get(url)
                    if res.status_code == 200:
                        text = res.text
                        if text == '0xdeadbeef':
                            server_port = port
                            break
                except:
                    continue
            
            if not server_port:
                return {
                    'status': 'error',
                    'message': 'Error: Ports not detected, Make Roblox is running and Hydrogen is installed',
                    'details': messages
                }
            
            post_url = f"http://127.0.0.1:{server_port}/execute"
            
            response = requests.post(
                post_url,
                headers={
                    'Content-Type': 'text/plain'
                },
                data=script_content
            )
            
            if response.status_code == 200:
                return {
                    'status': 'success',
                    'message': 'Script executed successfully',
                    'details': messages
                }
            else:
                error_text = response.text
                raise Exception(f"HTTP {response.status_code}: {error_text}")

        except Exception as e:
            messages.append(f"Error: {str(e)}")
            return {
                'status': 'error',
                'message': 'Script execution failed: ' + str(e),
                'details': messages
            }        
        
    def get_game_name(self, universe_id):
        """Get game name from universe ID"""
        try:
            game_info_url = f"https://games.roblox.com/v1/games?universeIds={universe_id}"
            game_response = requests.get(game_info_url)
            if game_response.status_code == 200:
                game_data = game_response.json()
                if game_data and "data" in game_data and len(game_data["data"]) > 0:
                    game_name = game_data["data"][0]["name"]
                    return {
                        'status': 'success',
                        'game_name': game_name
                    }
            
            return {
                'status': 'error',
                'message': 'Game not found'
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def getScripts(self, script):
        try:
            if script == "":
                res = requests.get("https://scriptblox.com/api/script/fetch")
            else:
                res = requests.get(f"https://scriptblox.com/api/script/search?q={script}")
                
            if res.status_code == 200:
                return res.json()
            else:
                raise Exception(f"HTTP {res.status_code}: {res.text}")
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }
            
    def openRoblox(self):
        try:
            roblox_pid = None
            for line in os.popen("ps aux | grep Roblox | grep -v grep"):
                parts = line.split()
                if len(parts) > 1:
                    roblox_pid = parts[1]
                    break
            if roblox_pid:
                os.system(f"kill -9 {roblox_pid}")
                return {
                    'status': 'error',
                    'message': f'Roblox process killed successfully'
                }
            else:
                os.system("open -a Roblox")
                return {
                    'status': 'success',
                    'message': 'Roblox opened successfully'
                }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Failed to open Roblox: {str(e)}'
            }
    
    def saveScript(self, name, content, auto_exec=False):
        try:
            if not name.endswith('.lua'):
                name = name + '.lua'
                
            name = os.path.basename(name)
            name = ''.join(c for c in name if c.isalnum() or c in '. _-')
            
            if not os.path.exists(self.scripts_directory):
                os.makedirs(self.scripts_directory)
                
            file_path = os.path.join(self.scripts_directory, name)
            
            with open(file_path, 'w') as f:
                f.write(content)
            
            if auto_exec:
                if not os.path.exists(self.hydrogen_autoexec_dir):
                    os.makedirs(self.hydrogen_autoexec_dir)
                autoexec_path = os.path.join(self.hydrogen_autoexec_dir, name)
                with open(autoexec_path, 'w') as f:
                    f.write(content)
            else:
                autoexec_path = os.path.join(self.hydrogen_autoexec_dir, name)
                if os.path.exists(autoexec_path):
                    os.remove(autoexec_path)
            
            return {
                'status': 'success',
                'message': f'Script saved to {file_path}',
                'path': file_path,
                'autoExec': auto_exec
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Failed to save script: {str(e)}'
            }
    
    def toggleAutoExec(self, script_name, enabled):
        try:
            script_path = os.path.join(self.scripts_directory, script_name)
            autoexec_path = os.path.join(self.hydrogen_autoexec_dir, script_name)
            
            if not os.path.exists(script_path):
                return {
                    'status': 'error',
                    'message': f'Script {script_name} not found'
                }
            
            if enabled:
                if not os.path.exists(self.hydrogen_autoexec_dir):
                    os.makedirs(self.hydrogen_autoexec_dir)
                with open(script_path, 'r') as f:
                    content = f.read()
                with open(autoexec_path, 'w') as f:
                    f.write(content)
            else:
                if os.path.exists(autoexec_path):
                    os.remove(autoexec_path)
            
            return {
                'status': 'success',
                'message': f'Auto-execute {"enabled" if enabled else "disabled"} for {script_name}'
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Failed to update auto-execute status: {str(e)}'
            }
    
    def getLocalScripts(self):
        try:
            if not os.path.exists(self.scripts_directory):
                os.makedirs(self.scripts_directory)
                
            files = []
            for filename in os.listdir(self.scripts_directory):
                if filename.endswith('.lua'):
                    file_path = os.path.join(self.scripts_directory, filename)
                    try:
                        with open(file_path, 'r') as f:
                            content = f.read()
                        
                        autoexec_path = os.path.join(self.hydrogen_autoexec_dir, filename)
                        auto_exec = os.path.exists(autoexec_path)
                        
                        files.append({
                            'name': filename,
                            'path': file_path,
                            'content': content,
                            'autoExec': auto_exec
                        })
                    except Exception as e:
                        print(f"Error reading file {filename}: {str(e)}")
            
            return {
                'status': 'success',
                'scripts': files
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }

    def deleteScript(self, script_name):
        try:
            script_path = os.path.join(self.scripts_directory, script_name)
            autoexec_path = os.path.join(self.hydrogen_autoexec_dir, script_name)
            
            if not os.path.exists(script_path):
                return {
                    'status': 'error',
                    'message': f'Script "{script_name}" not found'
                }
            
            os.remove(script_path)
            
            if os.path.exists(autoexec_path):
                os.remove(autoexec_path)
            
            return {
                'status': 'success',
                'message': f'Script "{script_name}" deleted successfully'
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Failed to delete script: {str(e)}'
            }
    
    def renameScript(self, old_name, new_name):
        try:
            if not new_name.endswith('.lua'):
                new_name = new_name + '.lua'
            
            new_name = os.path.basename(new_name)
            new_name = ''.join(c for c in new_name if c.isalnum() or c in '. _-')
            
            old_path = os.path.join(self.scripts_directory, old_name)
            new_path = os.path.join(self.scripts_directory, new_name)
            
            old_autoexec_path = os.path.join(self.hydrogen_autoexec_dir, old_name)
            new_autoexec_path = os.path.join(self.hydrogen_autoexec_dir, new_name)
            
            if not os.path.exists(old_path):
                return {
                    'status': 'error',
                    'message': f'Script "{old_name}" not found'
                }
            
            if os.path.exists(new_path) and old_name != new_name:
                return {
                    'status': 'error',
                    'message': f'Script "{new_name}" already exists'
                }
            
            with open(old_path, 'r') as f:
                content = f.read()
                
            os.rename(old_path, new_path)
            
            if os.path.exists(old_autoexec_path):
                with open(new_autoexec_path, 'w') as f:
                    f.write(content)
                os.remove(old_autoexec_path)
            
            return {
                'status': 'success',
                'message': f'Script renamed from "{old_name}" to "{new_name}"'
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Failed to rename script: {str(e)}'
            }

    def start_log_monitoring(self):
        if self.log_thread and self.log_thread.is_alive():
            return {"status": "already_running", "message": "Log monitoring is already running"}
        
        self.stop_log_monitoring = False
        self.log_thread = threading.Thread(target=self._monitor_log_file)
        self.log_thread.daemon = True
        self.log_thread.start()
    
    def stop_log_monitoring(self):
        if self.log_thread and self.log_thread.is_alive():
            self.stop_log_monitoring = True
            self.log_thread.join(timeout=1.0)
    
    def set_log_refresh_rate(self, rate):
        try:
            rate = float(rate)
            if rate < 0.1:
                rate = 0.1  
            elif rate > 5.0:
                rate = 5.0 
                
            self.log_refresh_rate = rate
        except Exception as e:
            print(f"Invalid refresh rate: {str(e)}")
    
    def _monitor_log_file(self):
        try:
            log_dir = os.path.expanduser('~/Library/Logs/Roblox')
            
            if not os.path.exists(log_dir):
                self.window.evaluate_js(f"updateConsoleOutput('Roblox logs directory not found: {log_dir}');")
                return
            
            self.window.evaluate_js("updateConsoleOutput('Starting log monitoring...');")
            
            current_log_file = None
            file_size = 0
            last_file_check = 0
            file_check_interval = 5 
            log_buffer = []
            last_update_time = time.time()
            update_interval = 0.3  
            
            while not self.stop_log_monitoring:
                current_time = time.time()
                
                if current_time - last_file_check >= file_check_interval:
                    try:
                        files = [f for f in os.listdir(log_dir) if os.path.isfile(os.path.join(log_dir, f))]
                        if files:
                            files.sort(key=lambda x: os.path.getmtime(os.path.join(log_dir, x)), reverse=True)
                            latest_log_file = os.path.join(log_dir, files[0])
                            
                            if latest_log_file != current_log_file:
                                current_log_file = latest_log_file
                                file_size = os.path.getsize(current_log_file)
                                self.window.evaluate_js(f"updateConsoleOutput('Monitoring new logs from: {os.path.basename(current_log_file)}');")
                        last_file_check = current_time
                    except Exception as e:
                        self.window.evaluate_js(f"updateConsoleOutput('Error checking log files: {str(e)}');")
                        time.sleep(2)
                        last_file_check = current_time
                        continue
                
                if current_log_file and os.path.exists(current_log_file):
                    try:
                        current_size = os.path.getsize(current_log_file)
                        
                        if current_size > file_size:
                            with open(current_log_file, 'r') as f:
                                f.seek(file_size)
                                chunk_size = 1024 * 1024  
                                if current_size - file_size > chunk_size:
                                    new_content = f.read(chunk_size)
                                else:
                                    new_content = f.read(current_size - file_size)
                            
                            file_size = os.path.getsize(current_log_file) 
                            
                            for line in new_content.splitlines():
                                if line.strip():
                                    timestamp = datetime.now().strftime('%H:%M:%S')
                                    log_buffer.append(f"[{timestamp}] {line}")
                    except Exception as e:
                        log_buffer.append(f"Error reading log file: {str(e)}")
                
                if log_buffer and (current_time - last_update_time >= update_interval):
                    try:
                        if len(log_buffer) > 100: 
                            to_send = log_buffer[-100:]
                            log_buffer = []
                        else:
                            to_send = log_buffer
                            log_buffer = []
                        
                        escaped_lines = []
                        for line in to_send:
                            escaped_line = line.replace('\\', '\\\\').replace('"', '\\"').replace("'", "\\'")
                            escaped_lines.append(escaped_line)
                        
                        if escaped_lines:
                            self.window.evaluate_js(f"batchUpdateConsole({json.dumps(escaped_lines)});")
                        
                        last_update_time = current_time
                    except Exception as e:
                        print(f"Error updating console: {str(e)}")
                
                if not log_buffer:
                    time.sleep(self.log_refresh_rate)
                else:
                    time.sleep(min(0.1, self.log_refresh_rate / 2))
            
        except Exception as e:
            if self.window:
                self.window.evaluate_js(f"updateConsoleOutput('Log monitoring error: {str(e)}');")

    def send_ai_prompt(self, prompt, editor_content=""):
        try:
            currenttime = time.time()
            url = "http://nitrobot.vercel.app/generate"
            payload = {
                "prompt": prompt,
                "context": editor_content,
                "timestamp": currenttime
            }
            response = requests.post(url, json=payload)
            
            if response.status_code == 429:
                return {
                    'status': 'error',
                    'message': 'Rate limit exceeded. Please wait a moment before trying again.'
                }
                
            response.raise_for_status()
            response_json = response.json()
            
            if 'error' in response_json:
                return {
                    'status': 'error',
                    'message': response_json['error']
                }
                
            code = response_json.get('code', '')
            explanation = response_json.get('explanation', '')
            
            return {
                'status': 'success',
                'result': code.strip(),
                'explanation': explanation.strip()
            }
                
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if hasattr(e, 'response') and hasattr(e.response, 'status_code') else 'unknown'
            
            if status_code == 429:
                error_message = "Rate limit exceeded. Please wait a moment before trying again."
            elif status_code == 404:
                error_message = "AI service endpoint could not be reached."
            elif status_code >= 500:
                error_message = "AI service is currently unavailable. Please try again later."
            else:
                error_message = f"HTTP Error {status_code}: {str(e)}"
                
            return {
                'status': 'error',
                'message': error_message
            }
        except requests.exceptions.ConnectionError:
            return {
                'status': 'error',
                'message': 'Connection error. Please check your internet connection.'
            }
        except requests.exceptions.Timeout:
            return {
                'status': 'error',
                'message': 'Request timed out. Please try again.'
            }
        except requests.exceptions.RequestException as e:
            return {
                'status': 'error',
                'message': f'Error making request: {str(e)}'
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error: {str(e)}'
            }

    def quit_app(self):
        NSApp.terminate_(None)

    def minimize_app(self):
        NSApp.hide_(None)

    def get_clipboard_content(self):
        """Get text content from system clipboard"""
        try:
            pasteboard = NSPasteboard.generalPasteboard()
            content = pasteboard.stringForType_(NSStringPboardType)
            
            if content:
                return {
                    'status': 'success',
                    'content': content
                }
            else:
                return {
                    'status': 'error',
                    'message': 'No text content found in clipboard'
                }
        except Exception as e:
            print(f"Error accessing clipboard: {str(e)}")
            return {
                'status': 'error', 
                'message': f'Failed to access clipboard: {str(e)}'
            }

class ScriptMenuHandler(NSObject):
    def initWithAPI_(self, api):
        self = objc.super(ScriptMenuHandler, self).init()
        if self is not None:
            self.api = api
        return self
    
    def executeScript_(self, sender):
        script_name = sender.title()
        try:
            script_path = os.path.join(self.api.scripts_directory, script_name)
            if os.path.exists(script_path):
                with open(script_path, 'r') as f:
                    script_content = f.read()
                self.api.execute_script(script_content)
        except Exception as e:
            print(f"Error executing script from menu: {str(e)}")
    
    def menuWillOpen_(self, menu):
        while menu.numberOfItems() > 0:
            menu.removeItemAtIndex_(0)
        
        header_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Nitrogen Direct", None, "")
        header_item.setEnabled_(False)
        menu.addItem_(header_item)
        menu.addItem_(NSMenuItem.separatorItem())
        
        scripts_added = False
        try:
            scripts = []
            if os.path.exists(self.api.scripts_directory):
                scripts = [f for f in os.listdir(self.api.scripts_directory) if f.endswith('.lua')]
            
            if scripts:
                scripts.sort()
                for script_name in scripts:
                    item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
                        script_name, "executeScript:", "")
                    item.setTarget_(self)
                    menu.addItem_(item)
                scripts_added = True
        except Exception as e:
            print(f"Error loading scripts: {str(e)}")
        
        if not scripts_added:
            no_scripts = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("No scripts found", None, "")
            no_scripts.setEnabled_(False)
            menu.addItem_(no_scripts)
        
        menu.addItem_(NSMenuItem.separatorItem())
        open_item = NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Open Nitrogen", "openNitrogen:", "")
        open_item.setTarget_(self)
        menu.addItem_(open_item)
        menu.addItem_(NSMenuItem.separatorItem())
        menu.addItem_(NSMenuItem.alloc().initWithTitle_action_keyEquivalent_("Quit", "terminate:", ""))
    
    def openNitrogen_(self, sender):
        NSApp.activateIgnoringOtherApps_(True)

def setup_menubar(api):
    statusbar = NSStatusBar.systemStatusBar()
    statusitem = statusbar.statusItemWithLength_(NSVariableStatusItemLength)
    statusitem.setTitle_("N₂")
    
    menu = NSMenu.alloc().init()
    script_handler = ScriptMenuHandler.alloc().initWithAPI_(api)
    
    menu.setDelegate_(script_handler)
    statusitem.setMenu_(menu)
    
    return statusitem, script_handler

NSApplication.sharedApplication()

api = API()
menubar_item, script_handler = setup_menubar(api)

webview.DRAG_REGION_SELECTOR = '.header'

window = webview.create_window('Nitrogen', './index.html', js_api=api, width=1280, height=720, min_size=(800,680), transparent=True, vibrancy=True, frameless=True, easy_drag=False)
api.window = window
webview.start()