#!/usr/bin/env node
/**
 * Setup ngrok Tunnel Script
 * Fully automatic - installs ngrok if needed, saves auth token, starts tunnel
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

// Store the ngrok executable path once found
let NGROK_PATH = "ngrok";

function run(cmd, cwd, silent = false) {
    return execSync(cmd, {
        stdio: silent ? "pipe" : "inherit",
        cwd,
        shell: true,
        encoding: "utf8"
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function question(rl, prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

// Config file for storing ngrok auth token
const CONFIG_DIR = path.join(os.homedir(), ".platfrix");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        }
    } catch { }
    return {};
}

function saveConfig(config) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getSavedNgrokToken() {
    return loadConfig().ngrokAuthToken || "";
}

function saveNgrokToken(token) {
    const config = loadConfig();
    config.ngrokAuthToken = token;
    saveConfig(config);
}

/**
 * Find ngrok executable in common locations
 */
function findNgrokPath() {
    // Try the current NGROK_PATH first
    try {
        run(`"${NGROK_PATH}" version`, process.cwd(), true);
        return NGROK_PATH;
    } catch { }

    // Common Windows installation paths for ngrok
    const searchPaths = [
        // Winget default location
        path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "ngrok"),
        path.join(process.env.PROGRAMFILES || "", "ngrok"),
        path.join(os.homedir(), "ngrok"),
        path.join(os.homedir(), "AppData", "Local", "ngrok"),
        // User PATH locations
        ...(process.env.PATH || "").split(";")
    ];

    // Search for ngrok.exe in these paths
    for (const searchPath of searchPaths) {
        if (!searchPath) continue;

        // Check if ngrok.exe exists directly in this path
        const directPath = path.join(searchPath, "ngrok.exe");
        if (fs.existsSync(directPath)) {
            NGROK_PATH = directPath;
            return directPath;
        }

        // Search in subdirectories (for Winget packages)
        try {
            if (fs.existsSync(searchPath) && fs.statSync(searchPath).isDirectory()) {
                const items = fs.readdirSync(searchPath);
                for (const item of items) {
                    if (item.toLowerCase().includes("ngrok")) {
                        const subPath = path.join(searchPath, item, "ngrok.exe");
                        if (fs.existsSync(subPath)) {
                            NGROK_PATH = subPath;
                            return subPath;
                        }
                        // Also check one level deeper
                        const itemPath = path.join(searchPath, item);
                        if (fs.statSync(itemPath).isDirectory()) {
                            const subItems = fs.readdirSync(itemPath);
                            for (const subItem of subItems) {
                                const deepPath = path.join(itemPath, subItem, "ngrok.exe");
                                if (fs.existsSync(deepPath)) {
                                    NGROK_PATH = deepPath;
                                    return deepPath;
                                }
                                // Check direct file
                                if (subItem === "ngrok.exe") {
                                    NGROK_PATH = path.join(itemPath, subItem);
                                    return NGROK_PATH;
                                }
                            }
                        }
                    }
                }
            }
        } catch { }
    }

    // Try using 'where' command on Windows
    if (process.platform === "win32") {
        try {
            const wherePath = run("where ngrok", process.cwd(), true).trim().split("\n")[0];
            if (wherePath && fs.existsSync(wherePath)) {
                NGROK_PATH = wherePath;
                return wherePath;
            }
        } catch { }
    }

    return null;
}

/**
 * Check if ngrok is installed and find its path
 */
export function isNgrokInstalled() {
    const found = findNgrokPath();
    return found !== null;
}

/**
 * Run ngrok command using the found path
 */
function runNgrok(args, silent = false) {
    const cmd = `"${NGROK_PATH}" ${args}`;
    return run(cmd, process.cwd(), silent);
}

/**
 * Install ngrok via winget (Windows) or npm
 */
export async function installNgrok() {
    console.log("   📥 Installing ngrok...");

    if (process.platform === "win32") {
        try {
            // Try winget first
            run("winget install --id Ngrok.Ngrok -e --accept-source-agreements --accept-package-agreements", process.cwd());
            console.log("   ✅ ngrok installed via winget");

            // Wait a moment for install to complete
            await sleep(2000);

            // Try to find the installed ngrok
            const ngrokPath = findNgrokPath();
            if (ngrokPath) {
                console.log(`   ✅ Found ngrok at: ${ngrokPath}`);
                return true;
            }

            // If not found in typical paths, search more aggressively
            console.log("   🔍 Searching for ngrok installation...");

            // Check WinGet packages folder more thoroughly
            const wingetPackages = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
            if (fs.existsSync(wingetPackages)) {
                const findInDir = (dir, depth = 0) => {
                    if (depth > 3) return null;
                    try {
                        const items = fs.readdirSync(dir);
                        for (const item of items) {
                            const itemPath = path.join(dir, item);
                            if (item === "ngrok.exe") {
                                return itemPath;
                            }
                            if (fs.statSync(itemPath).isDirectory()) {
                                const found = findInDir(itemPath, depth + 1);
                                if (found) return found;
                            }
                        }
                    } catch { }
                    return null;
                };

                const foundPath = findInDir(wingetPackages);
                if (foundPath) {
                    NGROK_PATH = foundPath;
                    console.log(`   ✅ Found ngrok at: ${foundPath}`);
                    return true;
                }
            }

            console.log("   ⚠️  ngrok installed but location not found");
            console.log("   Trying npm installation instead...");
        } catch (err) {
            console.log("   ⚠️  winget failed, trying npm...");
        }
    }

    // Fallback: install via npm globally
    try {
        run("npm install -g ngrok", process.cwd());
        console.log("   ✅ ngrok installed via npm");
        NGROK_PATH = "ngrok";
        return true;
    } catch {
        console.log("   ❌ Could not install ngrok automatically");
        console.log("   Please install manually: https://ngrok.com/download");
        return false;
    }
}

/**
 * Check if ngrok is authenticated
 */
export function isNgrokAuthenticated() {
    try {
        // Check ngrok config locations
        const configPaths = [
            path.join(os.homedir(), ".ngrok2", "ngrok.yml"),
            path.join(os.homedir(), "AppData", "Local", "ngrok", "ngrok.yml"),
            path.join(process.env.LOCALAPPDATA || "", "ngrok", "ngrok.yml")
        ];

        for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
                const config = fs.readFileSync(configPath, "utf8");
                if (config.includes("authtoken:")) {
                    return true;
                }
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Configure ngrok with auth token
 */
export async function configureNgrokAuth(rl) {
    // Check if we have a saved token
    const savedToken = getSavedNgrokToken();

    if (savedToken) {
        console.log("   🔑 Using saved ngrok auth token...");
        try {
            runNgrok(`config add-authtoken ${savedToken}`, true);
            console.log("   ✅ ngrok authenticated");
            return true;
        } catch {
            console.log("   ⚠️  Saved token is invalid, need new token");
        }
    }

    // Prompt for token
    console.log("\n   🔑 ngrok requires authentication");
    console.log("   Get your free auth token at: https://dashboard.ngrok.com/get-started/your-authtoken");

    // Open browser to ngrok dashboard
    if (process.platform === "win32") {
        try {
            run("start https://dashboard.ngrok.com/get-started/your-authtoken", process.cwd(), true);
        } catch { }
    }

    const token = (await question(rl, "   Enter your ngrok auth token: ")).trim();

    if (!token) {
        console.log("   ❌ No token provided");
        return false;
    }

    try {
        runNgrok(`config add-authtoken ${token}`, true);
        saveNgrokToken(token);
        console.log("   ✅ ngrok authenticated and token saved");
        return true;
    } catch (err) {
        console.log("   ❌ Failed to configure ngrok auth:", err.message);
        return false;
    }
}

/**
 * Start ngrok tunnel and return the public URL
 */
export async function startNgrokTunnel(port = 8080) {
    console.log(`   🌐 Starting ngrok tunnel to port ${port}...`);

    // Check if ngrok is already running
    try {
        const curlCmd = process.platform === "win32"
            ? `powershell -Command "(Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing).Content"`
            : "curl -s http://127.0.0.1:4040/api/tunnels";
        const response = run(curlCmd, process.cwd(), true);
        const tunnels = JSON.parse(response);
        if (tunnels.tunnels && tunnels.tunnels.length > 0) {
            const httpsUrl = tunnels.tunnels.find(t => t.public_url.startsWith("https://"))?.public_url;
            const existingUrl = httpsUrl || tunnels.tunnels[0].public_url;
            console.log(`   ✅ ngrok already running: ${existingUrl}`);
            return existingUrl;
        }
    } catch {
        // ngrok not running, start it
    }

    // Start ngrok in background using full path
    // On Windows, spawn with shell:true and proper escaping
    let ngrokProcess;
    if (process.platform === "win32") {
        // Use cmd /c with the full path for Windows
        ngrokProcess = spawn("cmd", ["/c", NGROK_PATH, "http", port.toString()], {
            detached: true,
            stdio: "ignore",
            windowsHide: true
        });
    } else {
        ngrokProcess = spawn(NGROK_PATH, ["http", port.toString()], {
            detached: true,
            stdio: "ignore"
        });
    }
    ngrokProcess.unref();

    // Wait for ngrok to start and get the URL
    console.log("   ⏳ Waiting for ngrok tunnel...");

    for (let i = 0; i < 30; i++) {
        await sleep(1000);
        try {
            const curlCmd = process.platform === "win32"
                ? `powershell -Command "(Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing).Content"`
                : "curl -s http://127.0.0.1:4040/api/tunnels";
            const response = run(curlCmd, process.cwd(), true);
            const tunnels = JSON.parse(response);
            if (tunnels.tunnels && tunnels.tunnels.length > 0) {
                const httpsUrl = tunnels.tunnels.find(t => t.public_url.startsWith("https://"))?.public_url;
                const url = httpsUrl || tunnels.tunnels[0].public_url;
                console.log(`   ✅ ngrok tunnel started: ${url}`);
                return url;
            }
        } catch {
            // ngrok not ready yet
        }
    }

    console.log("   ❌ Failed to start ngrok tunnel");
    return null;
}

/**
 * Get the current ngrok public URL
 */
export function getNgrokUrl() {
    try {
        const curlCmd = process.platform === "win32"
            ? `powershell -Command "(Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing).Content"`
            : "curl -s http://127.0.0.1:4040/api/tunnels";
        const response = run(curlCmd, process.cwd(), true);
        const tunnels = JSON.parse(response);
        if (tunnels.tunnels && tunnels.tunnels.length > 0) {
            const httpsUrl = tunnels.tunnels.find(t => t.public_url.startsWith("https://"))?.public_url;
            return httpsUrl || tunnels.tunnels[0].public_url;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Stop ngrok tunnel
 */
export function stopNgrok() {
    try {
        if (process.platform === "win32") {
            run("taskkill /F /IM ngrok.exe", process.cwd(), true);
        } else {
            run("pkill ngrok", process.cwd(), true);
        }
        console.log("   ✅ ngrok stopped");
    } catch {
        // ngrok may not be running
    }
}

/**
 * Main function to setup ngrok tunnel and webhook - FULLY AUTOMATIC
 */
export async function setupNgrokAndWebhook(options = {}) {
    const { repoFullName, jenkinsPort = 8080, rl } = options;

    console.log("\n🔗 Setting up GitHub Webhook with ngrok...");

    // Step 1: Ensure ngrok is installed
    if (!isNgrokInstalled()) {
        console.log("   📦 ngrok not found, installing...");
        const installed = await installNgrok();
        if (!installed) {
            return { success: false, reason: "install_failed" };
        }
        // Verify installation
        if (!isNgrokInstalled()) {
            console.log("   ❌ ngrok installation failed");
            return { success: false, reason: "install_failed" };
        }
    } else {
        console.log("   ✅ ngrok is installed");
    }

    // Step 2: Ensure ngrok is authenticated
    if (!isNgrokAuthenticated()) {
        if (!rl) {
            console.log("   ❌ ngrok not authenticated and no readline available");
            return { success: false, reason: "auth_required" };
        }
        const authenticated = await configureNgrokAuth(rl);
        if (!authenticated) {
            return { success: false, reason: "auth_failed" };
        }
    } else {
        console.log("   ✅ ngrok is authenticated");
    }

    // Step 3: Start ngrok tunnel
    const ngrokUrl = await startNgrokTunnel(jenkinsPort);
    if (!ngrokUrl) {
        return { success: false, reason: "tunnel_failed" };
    }

    // Step 4: Create webhook if repo is provided
    if (repoFullName) {
        const { setupWebhook } = await import("./setup-webhook.mjs");
        const webhookResult = await setupWebhook({
            repoFullName,
            jenkinsUrl: ngrokUrl
        });

        return {
            success: true,
            ngrokUrl,
            webhookUrl: `${ngrokUrl}/github-webhook/`,
            webhookCreated: webhookResult.created
        };
    }

    return {
        success: true,
        ngrokUrl,
        webhookUrl: `${ngrokUrl}/github-webhook/`
    };
}

// CLI execution
const isMainModule = process.argv[1]?.includes("setup-ngrok");
if (isMainModule) {
    const repoFullName = process.argv[2];
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    setupNgrokAndWebhook({ repoFullName, rl })
        .then(result => {
            rl.close();
            if (result.success) {
                console.log("\n✅ ngrok tunnel is running!");
                console.log(`   Public URL: ${result.ngrokUrl}`);
                console.log(`   Jenkins webhook URL: ${result.webhookUrl}`);
                if (result.webhookCreated) {
                    console.log("   ✅ GitHub webhook created automatically");
                }
            } else {
                console.log(`\n❌ Setup failed: ${result.reason}`);
            }
        })
        .catch(err => {
            rl.close();
            console.error("❌ Error:", err.message);
            process.exit(1);
        });
}
