#!/usr/bin/env node
/**
 * Clear Jenkins Jobs Script
 * Deletes ALL jobs from Jenkins to start fresh
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Jenkins configuration
const JENKINS_URL = "http://localhost:8080";
const JENKINS_USER = "admin";
const JENKINS_PASSWORD = "admin";

function run(cmd, cwd, silent = false) {
    return execSync(cmd, {
        stdio: silent ? "pipe" : "inherit",
        cwd,
        shell: true,
        encoding: "utf8"
    });
}

/**
 * Make a simple GET request using PowerShell
 */
function httpGet(url) {
    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
    const tempDir = process.env.TEMP || ".";

    if (process.platform === "win32") {
        const script = `
$headers = @{ "Authorization" = "Basic ${auth}" }
try {
    $response = Invoke-WebRequest -Uri "${url}" -Method GET -Headers $headers -UseBasicParsing
    $response.Content
} catch {
    Write-Output ""
}
`;
        const scriptFile = path.join(tempDir, "jenkins-get.ps1");
        fs.writeFileSync(scriptFile, script);

        try {
            return run(`powershell -ExecutionPolicy Bypass -File "${scriptFile}"`, process.cwd(), true);
        } catch {
            return null;
        }
    } else {
        try {
            return run(`curl -s "${url}" -H "Authorization: Basic ${auth}"`, process.cwd(), true);
        } catch {
            return null;
        }
    }
}

/**
 * Make a POST request with session and fresh crumb
 */
function httpPost(url, body, contentType = "application/x-www-form-urlencoded") {
    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
    const tempDir = process.env.TEMP || ".";

    if (process.platform === "win32") {
        // Write body to temp file
        const bodyFile = path.join(tempDir, "jenkins-body.txt");
        fs.writeFileSync(bodyFile, body);

        // Create PowerShell script that uses a WebSession to preserve cookies
        const script = `
$auth = "Basic ${auth}"

# Create a session to preserve cookies (required for crumb validation)
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Get fresh crumb with session
try {
    $crumbResponse = Invoke-WebRequest -Uri "${JENKINS_URL}/crumbIssuer/api/json" -Headers @{Authorization=$auth} -WebSession $session -UseBasicParsing
    $crumbData = $crumbResponse.Content | ConvertFrom-Json
} catch {
    Write-Error "Failed to get crumb: $_"
    exit 1
}

# Build headers with crumb
$headers = @{
    "Authorization" = $auth
    "Content-Type" = "${contentType}"
}
$headers[$crumbData.crumbRequestField] = $crumbData.crumb

# Read body and make POST request with same session
if ((Get-Item "${bodyFile}").Length -gt 0) {
    $body = Get-Content -Path "${bodyFile}" -Raw -Encoding UTF8
} else {
    $body = ""
}

try {
    $response = Invoke-WebRequest -Uri "${url}" -Method POST -Headers $headers -Body $body -WebSession $session -UseBasicParsing
    Write-Output "SUCCESS"
} catch {
    Write-Error "POST failed: $_"
    exit 1
}
`;
        const scriptFile = path.join(tempDir, "jenkins-post.ps1");
        fs.writeFileSync(scriptFile, script);

        try {
            const result = run(`powershell -ExecutionPolicy Bypass -File "${scriptFile}"`, process.cwd(), true);
            return result && result.includes("SUCCESS");
        } catch (err) {
            return false;
        }
    } else {
        // Linux/Mac implementation omitted for brevity as user is on Windows
        return false;
    }
}

async function clearJobs() {
    console.log("\n🧹 Cleaning up Jenkins jobs...");

    // Get list of jobs
    const result = httpGet(`${JENKINS_URL}/api/json?tree=jobs[name]`);
    if (!result) {
        console.log("   ❌ Could not connect to Jenkins");
        return;
    }

    try {
        const json = JSON.parse(result);
        const jobs = json.jobs || [];

        if (jobs.length === 0) {
            console.log("   ✅ No jobs found to delete");
            return;
        }

        console.log(`   Found ${jobs.length} jobs to delete`);

        for (const job of jobs) {
            console.log(`   Deleting job: ${job.name}`);
            const success = httpPost(
                `${JENKINS_URL}/job/${encodeURIComponent(job.name)}/doDelete`,
                "",
                "application/x-www-form-urlencoded"
            );

            if (success) {
                console.log(`   ✅ Job "${job.name}" deleted`);
            } else {
                console.log(`   ❌ Failed to delete job "${job.name}"`);
            }
        }

        console.log("\n✅ All jobs cleared!");

    } catch (err) {
        console.log("   ❌ Error parsing job list:", err.message);
    }
}

clearJobs();
