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

        // Docker Hub credentials (optional)
        console.log("\n   🐳 Docker Hub credentials (for pushing images to Docker Hub)");
        const setupDockerHub = await confirm(rl, "   Configure Docker Hub credentials?");
        let dockerHubUsername = "";
        let dockerHubPassword = "";
        if (setupDockerHub) {
            dockerHubUsername = (await question(rl, "   Docker Hub username: ")).trim();
            dockerHubPassword = (await question(rl, "   Docker Hub password: ")).trim();
        }

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
        console.log("│  STEP 1/4: Starting Jenkins                             │");
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
        console.log("│  STEP 2/4: Creating Angular Repository                  │");
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
        console.log("│  STEP 3/4: Adding Jenkins Pipeline                      │");
        console.log("└─────────────────────────────────────────────────────────┘");

        await copyPipeline({
            localDir: repoResult.localDir,
            pipelineType: "angular"
        });

        // ─────────────────────────────────────────────────────────────
        // Step 5: Configure Jenkins (credentials + pipeline job)
        // ─────────────────────────────────────────────────────────────
        console.log("\n\n┌─────────────────────────────────────────────────────────┐");
        console.log("│  STEP 4/4: Configuring Jenkins                          │");
        console.log("└─────────────────────────────────────────────────────────┘");

        await setupJenkins({
            repoName,
            repoFullName: repoResult.repoFullName,
            dockerHubUsername,
            dockerHubPassword
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

   ────────────────────────────────────────────────────────────
   OPTIONAL - For Webhooks:
   ────────────────────────────────────────────────────────────
   • Install ngrok: https://ngrok.com
   • Run: ngrok http 8080
   • Add webhook in GitHub repo settings

   ────────────────────────────────────────────────────────────
   START DEVELOPING:
      cd "${repoResult.localDir}"
      npm install
      npm start
`);

    } catch (err) {
        console.error("\n❌ Error:", err.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
