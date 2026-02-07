#!/usr/bin/env node
/**
 * Start Jenkins Script
 * Starts Jenkins via Docker Compose and waits for it to be ready
 */
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JENKINS_DIR = path.join(path.dirname(__dirname), "Jenkins");

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

/**
 * Check if Docker is running
 */
export function checkDocker() {
    try {
        run("docker info", process.cwd(), true);
        return true;
    } catch {
        return false;
    }
}

/**
 * Start Docker Desktop (Windows only)
 */
export async function startDockerDesktop() {
    if (process.platform !== "win32") {
        console.log("   ⚠️  Auto-start Docker only supported on Windows.");
        return false;
    }

    console.log("   🐢 Docker is not running. Attempting to start Docker Desktop...");

    try {
        // Try standard path
        const dockerPath = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
        if (fs.existsSync(dockerPath)) {
            spawn(dockerPath, { detached: true, stdio: 'ignore' }).unref();
        } else {
            // Try via start command
            run("start \"\" \"Docker Desktop\"", process.cwd(), true);
        }

        console.log("   ⏳ Waiting for Docker to start (this may take a minute)...");

        // Wait up to 2 minutes for Docker to be ready
        for (let i = 0; i < 60; i++) {
            if (checkDocker()) {
                console.log("   ✅ Docker started successfully!");
                return true;
            }
            process.stdout.write(`\r   Waiting for Docker... ${i * 2}s`);
            await sleep(2000);
        }
        console.log("\n");
        return false;
    } catch (e) {
        console.log(`\n   ❌ Failed to start Docker: ${e.message}`);
        return false;
    }
}

/**
 * Check if Jenkins container is already running
 */
export function isJenkinsRunning() {
    try {
        const result = run("docker ps --filter name=jenkins --format '{{.Names}}'", process.cwd(), true);
        return result.trim().includes("jenkins");
    } catch {
        return false;
    }
}

/**
 * Get Jenkins URL (local)
 */
export function getJenkinsUrl() {
    return "http://localhost:8080";
}

/**
 * Wait for Jenkins to be ready
 */
async function waitForJenkins(maxAttempts = 180) {
    console.log("   Waiting for Jenkins to start (this may take a few minutes on first run)...");

    for (let i = 0; i < maxAttempts; i++) {
        try {
            // Try to access Jenkins - use PowerShell on Windows, curl elsewhere
            let statusCode;
            if (process.platform === "win32") {
                const result = run("powershell -Command \"try { (Invoke-WebRequest -Uri http://localhost:8080/login -UseBasicParsing -TimeoutSec 2).StatusCode } catch { if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { 0 } }\"", process.cwd(), true);
                statusCode = result.trim();
            } else {
                statusCode = run("curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/login", process.cwd(), true);
            }
            if (statusCode.includes("200") || statusCode.includes("403")) {
                return true;
            }
        } catch {
            // Jenkins not ready yet
        }

        process.stdout.write(`\r   Waiting... ${i + 1}/${maxAttempts}s`);
        await sleep(1000);
    }

    return false;
}

/**
 * Get initial admin password
 */
export function getInitialAdminPassword() {
    try {
        const password = run("docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword", process.cwd(), true);
        return password.trim();
    } catch {
        return null;
    }
}

/**
 * Start Jenkins using Docker Compose
 */
export async function startJenkins(options = {}) {
    const { skipIfRunning = true } = options;

    console.log("\n🐳 Starting Jenkins...");

    // Check Docker
    if (!checkDocker()) {
        const started = await startDockerDesktop();
        if (!started) {
            throw new Error("Docker is not running. Please start Docker Desktop and try again.");
        }
    }

    // Check if already running
    if (isJenkinsRunning()) {
        if (skipIfRunning) {
            console.log("   ✅ Jenkins is already running");
            return {
                started: false,
                alreadyRunning: true,
                url: getJenkinsUrl()
            };
        }
    }

    // Check if docker-compose.yml exists
    const composeFile = path.join(JENKINS_DIR, "docker-compose.yml");
    if (!fs.existsSync(composeFile)) {
        throw new Error(`docker-compose.yml not found in ${JENKINS_DIR}`);
    }

    // Start Jenkins
    console.log("   Building and starting Jenkins container...");
    run("docker-compose up -d --build", JENKINS_DIR);

    // Wait for Jenkins to be ready
    const ready = await waitForJenkins();

    if (!ready) {
        throw new Error("Jenkins failed to start within timeout");
    }

    console.log("\n   ✅ Jenkins is running!");

    // Get initial password
    const password = getInitialAdminPassword();

    return {
        started: true,
        alreadyRunning: false,
        url: getJenkinsUrl(),
        initialPassword: password
    };
}

/**
 * Stop Jenkins
 */
export function stopJenkins() {
    console.log("\n🛑 Stopping Jenkins...");
    run("docker-compose down", JENKINS_DIR);
    console.log("   ✅ Jenkins stopped");
}

// Run standalone if executed directly
const isMainModule = process.argv[1]?.includes("start-jenkins");
if (isMainModule) {
    const action = process.argv[2] || "start";

    if (action === "stop") {
        stopJenkins();
    } else {
        startJenkins()
            .then(result => {
                console.log(`\n   🌐 Jenkins URL: ${result.url}`);
                if (result.initialPassword) {
                    console.log(`   🔑 Initial Password: ${result.initialPassword}`);
                }
                console.log("\n   Open http://localhost:8080 in your browser to complete setup.\n");
            })
            .catch(err => {
                console.error("❌ Error:", err.message);
                process.exit(1);
            });
    }
}
