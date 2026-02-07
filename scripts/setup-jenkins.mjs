#!/usr/bin/env node
/**
 * Setup Jenkins Script
 * Configures Jenkins via REST API:
 * - Add credentials (Docker Hub, GitHub, etc.)
 * - Create pipeline jobs
 * 
 * Uses PowerShell WebSessions on Windows to preserve cookies for crumb validation
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import readline from "node:readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default Jenkins configuration
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
 * Uses WebSession to preserve cookies between crumb request and POST
 */
function httpPost(url, body, contentType = "application/xml") {
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
$body = Get-Content -Path "${bodyFile}" -Raw -Encoding UTF8
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
        // Use curl on Linux/Mac with cookie jar
        try {
            const cookieFile = "/tmp/jenkins-cookies.txt";

            // Get crumb with cookies
            const crumbResult = run(`curl -s -c ${cookieFile} "${JENKINS_URL}/crumbIssuer/api/json" -H "Authorization: Basic ${auth}"`, process.cwd(), true);
            const crumbData = JSON.parse(crumbResult);

            // Write body to file
            const tempFile = "/tmp/jenkins-body.txt";
            fs.writeFileSync(tempFile, body);

            // Make POST with cookies
            run(`curl -s -b ${cookieFile} -X POST "${url}" -H "Authorization: Basic ${auth}" -H "Content-Type: ${contentType}" -H "${crumbData.crumbRequestField}: ${crumbData.crumb}" --data-binary "@${tempFile}"`, process.cwd(), true);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Check if Jenkins is ready and API is accessible
 */
export async function checkJenkinsApi() {
    try {
        const result = httpGet(`${JENKINS_URL}/api/json`);
        return result && result.includes("mode");
    } catch {
        return false;
    }
}

/**
 * Add a credential to Jenkins
 */
export function addCredential(credentialId, username, password, description = "") {
    console.log(`   Adding credential: ${credentialId}`);

    const credentialXml = `
<com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
  <scope>GLOBAL</scope>
  <id>${credentialId}</id>
  <description>${description}</description>
  <username>${username}</username>
  <password>${password}</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
`.trim();

    const success = httpPost(
        `${JENKINS_URL}/credentials/store/system/domain/_/createCredentials`,
        credentialXml,
        "application/xml"
    );

    if (success) {
        console.log(`   ✅ Credential "${credentialId}" added`);
    } else {
        console.log(`   ❌ Failed to add credential`);
    }
    return success;
}

/**
 * Create a pipeline job in Jenkins
 */
export function createPipelineJob(jobName, githubRepoUrl, branch = "master", jenkinsfilePath = "Jenkinsfile") {
    console.log(`   Creating pipeline job: ${jobName}`);

    // Check if job already exists
    const exists = httpGet(`${JENKINS_URL}/job/${encodeURIComponent(jobName)}/api/json`);
    if (exists && exists.includes("fullName")) {
        console.log(`   ⚠️  Job "${jobName}" already exists, skipping`);
        return true;
    }

    const jobConfigXml = `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>Pipeline for ${jobName}</description>
  <keepDependencies>false</keepDependencies>
  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github">
      <projectUrl>${githubRepoUrl}/</projectUrl>
      <displayName></displayName>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>${githubRepoUrl}.git</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/${branch}</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>${jenkinsfilePath}</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers>
    <com.cloudbees.jenkins.GitHubPushTrigger plugin="github">
      <spec></spec>
    </com.cloudbees.jenkins.GitHubPushTrigger>
  </triggers>
  <disabled>false</disabled>
</flow-definition>`;

    const success = httpPost(
        `${JENKINS_URL}/createItem?name=${encodeURIComponent(jobName)}`,
        jobConfigXml,
        "application/xml"
    );

    if (success) {
        console.log(`   ✅ Pipeline job "${jobName}" created`);
    } else {
        console.log(`   ❌ Failed to create job`);
    }
    return success;
}

/**
 * Main setup function called by orchestrator
 */
export async function setupJenkins(options = {}) {
    const { repoName, repoFullName, dockerHubUsername, dockerHubPassword, branch = "master" } = options;

    console.log("\n🔧 Configuring Jenkins...");

    // Wait for Jenkins API to be ready
    let apiReady = false;
    for (let i = 0; i < 30; i++) {
        if (await checkJenkinsApi()) {
            apiReady = true;
            break;
        }
        await sleep(1000);
    }

    if (!apiReady) {
        console.log("   ⚠️  Jenkins API not ready, skipping configuration");
        return false;
    }

    console.log("   ✅ Jenkins API is ready");

    // Add Docker Hub credentials if provided
    if (dockerHubUsername && dockerHubPassword) {
        addCredential(
            "docker-hub-credentials",
            dockerHubUsername,
            dockerHubPassword,
            "Docker Hub credentials for pushing images"
        );
    }

    // Create pipeline job
    if (repoName && repoFullName) {
        const githubUrl = `https://github.com/${repoFullName}`;
        createPipelineJob(repoName, githubUrl, branch);
    }

    console.log("   ✅ Jenkins configuration complete\n");
    return true;
}

// Interactive prompts helper
function question(rl, prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

// Run standalone if executed directly
const isMainModule = process.argv[1]?.includes("setup-jenkins");
if (isMainModule) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    (async () => {
        console.log("\n🔧 Jenkins Setup Utility\n");

        const repoName = await question(rl, "Repository name (for job): ");
        const repoFullName = await question(rl, "GitHub repo (owner/name): ");
        const branch = await question(rl, "Branch (default: master): ") || "master";
        const dockerUser = await question(rl, "Docker Hub username (or press Enter to skip): ");
        const dockerPass = dockerUser ? await question(rl, "Docker Hub password: ") : "";

        await setupJenkins({
            repoName,
            repoFullName,
            branch,
            dockerHubUsername: dockerUser,
            dockerHubPassword: dockerPass
        });

        rl.close();
    })();
}
