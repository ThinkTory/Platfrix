#!/usr/bin/env node
/**
 * Platfrix Init - Main Orchestrator
 * 
 * Automates the full project setup:
 * 1. Start Jenkins (if not running)
 * 2. Create Angular repository on GitHub
 * 3. Copy Jenkinsfile to repository
 * 4. Setup GitHub webhook for Jenkins
 * 
 * Usage: node platfrix-init.mjs [options]
 */
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Import modular scripts
import {
    createAngularRepo,
    ensureGitHubCLI,
    getUsername,
    getOrganizations
} from "./scripts/create-repo.mjs";
import { copyPipeline } from "./scripts/copy-pipeline.mjs";
import { setupWebhook } from "./scripts/setup-webhook.mjs";
import {
    startJenkins,
    checkDocker,
    startDockerDesktop,
    getJenkinsUrl as getLocalJenkinsUrl
} from "./scripts/start-jenkins.mjs";
import { setupJenkins } from "./scripts/setup-jenkins.mjs";
import { setupNgrokAndWebhook } from "./scripts/setup-ngrok.mjs";
import { getDockerHubCredentials, saveDockerHubCredentials, hasDockerHubCredentials } from "./scripts/config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper functions
function question(rl, prompt) {
    return new Promise(resolve => rl.question(prompt, resolve));
}

async function confirm(rl, prompt) {
    const answer = await question(rl, `${prompt} (y/n): `);
    return answer.toLowerCase().startsWith("y");
}

async function selectFromList(rl, items, prompt) {
    console.log(`\n${prompt}`);
    items.forEach((item, i) => console.log(`  ${i + 1}) ${item}`));

    while (true) {
        const answer = await question(rl, `\nEnter number (1-${items.length}): `);
        const num = parseInt(answer, 10);
        if (num >= 1 && num <= items.length) {
            return items[num - 1];
        }
        console.log("Invalid selection, try again.");
    }
}

function printBanner() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🚀 PLATFRIX INIT                       ║
║         Angular Project + GitHub + Jenkins CI/CD          ║
╚═══════════════════════════════════════════════════════════╝
`);
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        printBanner();

        // ─────────────────────────────────────────────────────────────
        // Step 0: Check prerequisites
        // ─────────────────────────────────────────────────────────────
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("                    🔍 CHECKING PREREQUISITES              ");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // Check Docker
        if (!checkDocker()) {
            const success = await startDockerDesktop();
            if (!success) {
                console.log("❌ Docker is not running!");
                console.log("   Please start Docker Desktop and run this command again.\n");
                process.exit(1);
            }
        }
        console.log("   ✅ Docker is running");

        // Ensure GitHub CLI is ready
        ensureGitHubCLI();
        console.log("   ✅ GitHub CLI authenticated");

        const username = getUsername();
        const orgs = getOrganizations();

        // ─────────────────────────────────────────────────────────────
        // Step 1: Gather project information
        // ─────────────────────────────────────────────────────────────
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("                    📋 PROJECT DETAILS                    ");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // Repository name
        let repoName = await question(rl, "📝 Repository name: ");
        repoName = repoName.trim();
        if (!repoName) {
            throw new Error("Repository name is required");
        }

        // Organization
        let owner = username;
        const useOrg = await confirm(rl, "\n🏢 Create in a GitHub organization?");
        if (useOrg) {
            if (orgs.length > 0) {
                const options = [...orgs, "📝 Enter manually"];
                const selected = await selectFromList(rl, options, "Select organization:");
                if (selected === "📝 Enter manually") {
                    owner = (await question(rl, "Enter organization name: ")).trim() || username;
                } else {
                    owner = selected;
                }
            } else {
                console.log("   (No organizations found)");
                owner = (await question(rl, "Enter organization name: ")).trim() || username;
            }
        }

        // Visibility
        const isPrivate = await confirm(rl, "\n🔒 Create as private repository?");

        // Output directory
        let outputDir = await question(rl, `\n📁 Output directory (${process.cwd()}): `);
        outputDir = outputDir.trim() || process.cwd();

        // Docker Hub credentials (optional - saved after first entry)
        console.log("\n   🐳 Docker Hub credentials (for pushing images to Docker Hub)");
        let dockerHubUsername = "";
        let dockerHubPassword = "";

        const savedCreds = getDockerHubCredentials();
        if (savedCreds.username && savedCreds.password) {
            console.log(`   ✅ Saved credentials found for: ${savedCreds.username}`);
            const useSaved = await confirm(rl, "   Use saved Docker Hub credentials?");
            if (useSaved) {
                dockerHubUsername = savedCreds.username;
                dockerHubPassword = savedCreds.password;
            } else {
                const updateCreds = await confirm(rl, "   Enter new credentials?");
                if (updateCreds) {
                    dockerHubUsername = (await question(rl, "   Docker Hub username: ")).trim();
                    dockerHubPassword = (await question(rl, "   Docker Hub password: ")).trim();
                    if (dockerHubUsername && dockerHubPassword) {
                        saveDockerHubCredentials(dockerHubUsername, dockerHubPassword);
                        console.log("   💾 Credentials saved for future use");
                    }
                }
            }
        } else {
            const setupDockerHub = await confirm(rl, "   Configure Docker Hub credentials?");
            if (setupDockerHub) {
                dockerHubUsername = (await question(rl, "   Docker Hub username: ")).trim();
                dockerHubPassword = (await question(rl, "   Docker Hub password: ")).trim();
                if (dockerHubUsername && dockerHubPassword) {
                    const saveCreds = await confirm(rl, "   Save credentials for future use?");
                    if (saveCreds) {
                        saveDockerHubCredentials(dockerHubUsername, dockerHubPassword);
                        console.log("   💾 Credentials saved");
                    }
                }
            }
        }

        // Webhook setup is now fully automatic (no prompt needed)

        // ─────────────────────────────────────────────────────────────
        // Summary and confirmation
        // ─────────────────────────────────────────────────────────────
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("                       📋 SUMMARY                         ");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`   Repository:  ${owner}/${repoName}`);
        console.log(`   Visibility:  ${isPrivate ? "Private" : "Public"}`);
        console.log(`   Local path:  ${path.join(outputDir, repoName)}`);
        console.log(`   Jenkins:     Local (http://localhost:8080)`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        const proceed = await confirm(rl, "Proceed with setup?");
        if (!proceed) {
            console.log("\n❌ Cancelled.");
            process.exit(0);
        }

        // ─────────────────────────────────────────────────────────────
        // Step 2: Start Jenkins
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 1/5: Starting Jenkins                             │");
        console.log("└─────────────────────────────────────────────────────────┘");

        const jenkinsResult = await startJenkins({ skipIfRunning: true });
        const jenkinsUrl = getLocalJenkinsUrl();

        if (jenkinsResult.initialPassword && jenkinsResult.started) {
            console.log(`\n   🔑 Initial Admin Password: ${jenkinsResult.initialPassword}`);
            console.log("   📝 Save this! You'll need it to complete Jenkins setup.\n");
        }

        // ─────────────────────────────────────────────────────────────
        // Step 3: Create repository
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 2/5: Creating Angular Repository                  │");
        console.log("└─────────────────────────────────────────────────────────┘\n");

        const repoResult = await createAngularRepo({
            name: repoName,
            owner,
            outputDir,
            isPrivate
        });

        // ─────────────────────────────────────────────────────────────
        // Step 4: Copy Jenkinsfile
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 3/5: Adding Jenkins Pipeline                      │");
        console.log("└─────────────────────────────────────────────────────────┘");

        await copyPipeline({
            localDir: repoResult.localDir,
            pipelineType: "angular"
        });

        // ─────────────────────────────────────────────────────────────
        // Step 5: Configure Jenkins (credentials + pipeline job)
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 4/5: Configuring Jenkins                          │");
        console.log("└─────────────────────────────────────────────────────────┘");

        await setupJenkins({
            repoName,
            repoFullName: repoResult.repoFullName,
            dockerHubUsername,
            dockerHubPassword
        });

        // ─────────────────────────────────────────────────────────────
        // Step 6: Setup ngrok and webhook (fully automatic)
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 5/5: Setting up GitHub Webhook                    │");
        console.log("└─────────────────────────────────────────────────────────┘");

        const webhookResult = await setupNgrokAndWebhook({
            repoFullName: repoResult.repoFullName,
            jenkinsPort: 8080,
            rl  // Pass readline for auth token prompting if needed
        });

        // ─────────────────────────────────────────────────────────────
        // Done!
        // ─────────────────────────────────────────────────────────────
        console.log("\n╔═══════════════════════════════════════════════════════════╗");
        console.log("║                    ✅ SETUP COMPLETE!                     ║");
        console.log("╚═══════════════════════════════════════════════════════════╝");
        console.log(`
   📁 Local:    ${repoResult.localDir}
   🔗 GitHub:   https://github.com/${repoResult.repoFullName}
   🐳 Jenkins:  ${jenkinsUrl}
   📋 Pipeline: Jenkinsfile added

   ────────────────────────────────────────────────────────────
   EVERYTHING IS CONFIGURED! Here's what was set up:
   ────────────────────────────────────────────────────────────

   ✅ Jenkins running with pre-installed plugins
   ✅ Admin user: admin / admin
   ✅ Pipeline job "${repoName}" created
   ${dockerHubUsername ? "✅ Docker Hub credentials configured" : "⚠️  Docker Hub credentials not configured (optional)"}
   ${webhookResult.success ? `✅ GitHub webhook configured (${webhookResult.ngrokUrl})` : "⚠️  GitHub webhook not configured (optional)"}

   ────────────────────────────────────────────────────────────
   START DEVELOPING:
      cd "${repoResult.localDir}"
      npm install
      npm start
${webhookResult.success ? `
   ────────────────────────────────────────────────────────────
   NOTE: ngrok is running in the background.
   Keep this terminal open or the webhook will stop working.
   To stop ngrok: taskkill /F /IM ngrok.exe (Windows)
` : ""}`);

    } catch (err) {
        console.error("\n❌ Error:", err.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
