#!/usr/bin/env node
/**
 * Platfrix Configuration Manager
 * Stores and retrieves user configuration (credentials, preferences)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Config file location: ~/.platfrix/config.json
const CONFIG_DIR = path.join(os.homedir(), ".platfrix");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

/**
 * Load configuration from file
 */
export function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, "utf8");
            return JSON.parse(data);
        }
    } catch (err) {
        console.log("   ⚠️  Could not load config:", err.message);
    }
    return {};
}

/**
 * Save configuration to file
 */
export function saveConfig(config) {
    try {
        ensureConfigDir();
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.log("   ⚠️  Could not save config:", err.message);
        return false;
    }
}

/**
 * Get a specific config value
 */
export function getConfigValue(key) {
    const config = loadConfig();
    return config[key];
}

/**
 * Set a specific config value
 */
export function setConfigValue(key, value) {
    const config = loadConfig();
    config[key] = value;
    return saveConfig(config);
}

/**
 * Get Docker Hub credentials
 */
export function getDockerHubCredentials() {
    const config = loadConfig();
    return {
        username: config.dockerHubUsername || "",
        password: config.dockerHubPassword || ""
    };
}

/**
 * Save Docker Hub credentials
 */
export function saveDockerHubCredentials(username, password) {
    const config = loadConfig();
    config.dockerHubUsername = username;
    config.dockerHubPassword = password;
    return saveConfig(config);
}

/**
 * Check if Docker Hub credentials are saved
 */
export function hasDockerHubCredentials() {
    const creds = getDockerHubCredentials();
    return !!(creds.username && creds.password);
}

/**
 * Clear Docker Hub credentials
 */
export function clearDockerHubCredentials() {
    const config = loadConfig();
    delete config.dockerHubUsername;
    delete config.dockerHubPassword;
    return saveConfig(config);
}

/**
 * Get GitHub credentials (for private repos)
 */
export function getGitHubCredentials() {
    const config = loadConfig();
    return {
        username: config.githubUsername || "",
        token: config.githubToken || ""
    };
}

/**
 * Save GitHub credentials
 */
export function saveGitHubCredentials(username, token) {
    const config = loadConfig();
    config.githubUsername = username;
    config.githubToken = token;
    return saveConfig(config);
}

/**
 * Check if GitHub credentials are saved
 */
export function hasGitHubCredentials() {
    const creds = getGitHubCredentials();
    return !!(creds.username && creds.token);
}

/**
 * Clear GitHub credentials
 */
export function clearGitHubCredentials() {
    const config = loadConfig();
    delete config.githubUsername;
    delete config.githubToken;
    return saveConfig(config);
}

// CLI commands if run directly
const isMainModule = process.argv[1]?.includes("config");
if (isMainModule) {
    const command = process.argv[2];

    switch (command) {
        case "show":
            console.log("Platfrix Configuration:");
            console.log(JSON.stringify(loadConfig(), null, 2));
            break;
        case "clear":
            saveConfig({});
            console.log("Configuration cleared.");
            break;
        case "clear-docker":
            clearDockerHubCredentials();
            console.log("Docker Hub credentials cleared.");
            break;
        default:
            console.log("Usage: node config.mjs [show|clear|clear-docker]");
    }
}
