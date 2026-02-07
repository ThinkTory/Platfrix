#!/usr/bin/env node
/**
 * Setup Jenkins Script
 * Configures Jenkins via REST API:
 * - Add credentials (Docker Hub, GitHub, etc.)
 * - Create pipeline jobs
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
 * Make a Jenkins API request using curl
 */
function jenkinsApi(endpoint, method = "GET", data = null, contentType = "application/json") {
    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
    let cmd = `curl -s -X ${method} "${JENKINS_URL}${endpoint}" -H "Authorization: Basic ${auth}"`;

    if (data) {
        if (contentType === "application/xml") {
            // Write XML to temp file to avoid escaping issues
            const tempFile = path.join(process.env.TEMP || "/tmp", "jenkins-config.xml");
            fs.writeFileSync(tempFile, data);
            cmd += ` -H "Content-Type: ${contentType}" --data-binary "@${tempFile}"`;
        } else {
            cmd += ` -H "Content-Type: ${contentType}" -d "${data.replace(/"/g, '\\"')}"`;
        }
    }

    try {
        return run(cmd, process.cwd(), true);
    } catch (err) {
        return null;
    }
}

/**
 * Get Jenkins crumb for CSRF protection
 */
function getCrumb() {
    try {
        const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
        const result = run(
            `curl -s "${JENKINS_URL}/crumbIssuer/api/json" -H "Authorization: Basic ${auth}"`,
            process.cwd(),
            true
        );
        const json = JSON.parse(result);
        return { field: json.crumbRequestField, value: json.crumb };
    } catch {
        return null;
    }
}

/**
 * Check if Jenkins is ready and API is accessible
 */
export async function checkJenkinsApi() {
    try {
        const result = jenkinsApi("/api/json");
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

    const crumb = getCrumb();
    if (!crumb) {
        console.log("   ⚠️  Could not get Jenkins crumb token");
        return false;
    }

    const credentialXml = `
<com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
  <scope>GLOBAL</scope>
  <id>${credentialId}</id>
  <description>${description}</description>
  <username>${username}</username>
  <password>${password}</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
`.trim();

    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
    const tempFile = path.join(process.env.TEMP || "/tmp", "jenkins-cred.xml");
    fs.writeFileSync(tempFile, credentialXml);

    try {
        run(
            `curl -s -X POST "${JENKINS_URL}/credentials/store/system/domain/_/createCredentials" ` +
            `-H "Authorization: Basic ${auth}" ` +
            `-H "${crumb.field}: ${crumb.value}" ` +
            `-H "Content-Type: application/xml" ` +
            `--data-binary "@${tempFile}"`,
            process.cwd(),
            true
        );
        console.log(`   ✅ Credential "${credentialId}" added`);
        return true;
    } catch (err) {
        console.log(`   ❌ Failed to add credential: ${err.message}`);
        return false;
    }
}

/**
 * Create a pipeline job in Jenkins
 */
export function createPipelineJob(jobName, githubRepoUrl, jenkinsfilePath = "Jenkinsfile") {
    console.log(`   Creating pipeline job: ${jobName}`);

    // Check if job already exists
    const exists = jenkinsApi(`/job/${encodeURIComponent(jobName)}/api/json`);
    if (exists && exists.includes("fullName")) {
        console.log(`   ⚠️  Job "${jobName}" already exists, skipping`);
        return true;
    }

    const crumb = getCrumb();
    if (!crumb) {
        console.log("   ⚠️  Could not get Jenkins crumb token");
        return false;
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
          <name>*/main</name>
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

    const auth = Buffer.from(`${JENKINS_USER}:${JENKINS_PASSWORD}`).toString("base64");
    const tempFile = path.join(process.env.TEMP || "/tmp", "jenkins-job.xml");
    fs.writeFileSync(tempFile, jobConfigXml);

    try {
        run(
            `curl -s -X POST "${JENKINS_URL}/createItem?name=${encodeURIComponent(jobName)}" ` +
            `-H "Authorization: Basic ${auth}" ` +
            `-H "${crumb.field}: ${crumb.value}" ` +
            `-H "Content-Type: application/xml" ` +
            `--data-binary "@${tempFile}"`,
            process.cwd(),
            true
        );
        console.log(`   ✅ Pipeline job "${jobName}" created`);
        return true;
    } catch (err) {
        console.log(`   ❌ Failed to create job: ${err.message}`);
        return false;
    }
}

/**
 * Main setup function called by orchestrator
 */
export async function setupJenkins(options = {}) {
    const { repoName, repoFullName, dockerHubUsername, dockerHubPassword } = options;

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
        createPipelineJob(repoName, githubUrl);
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
        const dockerUser = await question(rl, "Docker Hub username (or press Enter to skip): ");
        const dockerPass = dockerUser ? await question(rl, "Docker Hub password: ") : "";

        await setupJenkins({
            repoName,
            repoFullName,
            dockerHubUsername: dockerUser,
            dockerHubPassword: dockerPass
        });

        rl.close();
    })();
}
