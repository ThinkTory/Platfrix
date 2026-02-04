#!/usr/bin/env node
/**
 * Create Angular Repository Script
 * Creates a new Angular project and pushes to GitHub
 * 
 * Can be run standalone or imported by orchestrator
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

// Utility functions
export function run(cmd, cwd, silent = false) {
    return execSync(cmd, {
        stdio: silent ? "pipe" : "inherit",
        cwd,
        shell: true,
        encoding: "utf8"
    });
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function question(rl, prompt) {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
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

async function confirm(rl, prompt) {
    const answer = await question(rl, `${prompt} (y/n): `);
    return answer.toLowerCase().startsWith("y");
}

// GitHub helper functions
export function ensureGitHubCLI() {
    try {
        run("gh --version", process.cwd(), true);
    } catch {
        console.log("📥 GitHub CLI (gh) not found. Installing...\n");
        try {
            if (process.platform === "win32") {
                run("winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements", process.cwd());
                console.log("\n✅ GitHub CLI installed! Please restart your terminal and run again.");
                process.exit(0);
            } else {
                console.error("❌ Please install GitHub CLI: https://cli.github.com/");
                process.exit(1);
            }
        } catch {
            console.error("❌ Failed to install GitHub CLI.");
            process.exit(1);
        }
    }

    // Check authentication
    try {
        run("gh auth status", process.cwd(), true);
    } catch {
        console.log("🔐 GitHub CLI not authenticated. Starting login...\n");
        run("gh auth login", process.cwd());
    }
}

export function getUsername() {
    return run("gh api user -q .login", process.cwd(), true).trim();
}

export function getOrganizations() {
    try {
        const result = run('gh api user/orgs --jq ".[].login"', process.cwd(), true).trim();
        if (!result) return [];
        return result.split(/\r?\n/).filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Main function to create Angular repository
 * @param {Object} options - Configuration options
 * @param {string} options.name - Repository name
 * @param {string} options.owner - GitHub owner (user or org)
 * @param {string} options.outputDir - Output directory
 * @param {boolean} options.isPrivate - Private repository
 * @returns {Object} - Result with repoFullName and localDir
 */
export async function createAngularRepo(options) {
    const { name, owner, outputDir, isPrivate } = options;

    const repoFullName = `${owner}/${name}`;
    const finalDir = path.join(outputDir, name);
    const tempDir = path.join(os.tmpdir(), `angular-scaffold-${Date.now()}`);
    const tempProject = path.join(tempDir, name);

    console.log(`\n${"─".repeat(50)}`);
    console.log(`🎯 Repository: ${repoFullName}`);
    console.log(`📁 Local path: ${finalDir}`);
    console.log(`🔐 Visibility: ${isPrivate ? "Private" : "Public"}`);
    console.log(`${"─".repeat(50)}\n`);

    // Validations
    if (!fs.existsSync(outputDir)) {
        throw new Error(`Output directory "${outputDir}" does not exist.`);
    }

    if (fs.existsSync(finalDir)) {
        throw new Error(`Directory "${finalDir}" already exists.`);
    }

    try {
        run(`gh repo view ${repoFullName}`, process.cwd(), true);
        throw new Error(`Repository ${repoFullName} already exists on GitHub.`);
    } catch (err) {
        if (err.message.includes("already exists")) throw err;
        // Good - repo doesn't exist
    }

    fs.mkdirSync(tempDir, { recursive: true });

    try {
        // 1) Generate Angular project
        console.log("📦 Creating Angular project...");
        run(
            `npx -y @angular/cli@latest new ${name} --routing --style=scss --standalone --strict --skip-git`,
            tempDir
        );

        // 2) Add configurations
        console.log("🔧 Adding project configurations...");
        run(`npm i -D prettier`, tempProject);

        fs.writeFileSync(
            path.join(tempProject, ".prettierrc"),
            JSON.stringify({ singleQuote: true, printWidth: 100 }, null, 2)
        );

        fs.writeFileSync(
            path.join(tempProject, ".editorconfig"),
            `root = true\n\n[*]\nend_of_line = lf\ninsert_final_newline = true\ncharset = utf-8\nindent_style = space\nindent_size = 2\n`
        );

        fs.writeFileSync(
            path.join(tempProject, "Dockerfile"),
            `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist/${name}/browser /usr/share/nginx/html\nEXPOSE 80\n`
        );

        // 3) Initialize git
        console.log("🚀 Initializing git...");
        await sleep(2000);
        run(`git init`, tempProject);
        run(`git add -A`, tempProject);
        run(`git commit -m "chore: initial angular scaffold"`, tempProject);

        // 4) Create GitHub repository
        console.log("🌐 Creating GitHub repository...");
        const visibility = isPrivate ? "--private" : "--public";
        run(`gh repo create ${repoFullName} ${visibility} --source="${tempProject}" --remote=origin --push`, process.cwd());

        // 5) Clone to final location
        console.log(`📁 Cloning to: ${finalDir}`);
        run(`gh repo clone ${repoFullName} "${finalDir}"`, process.cwd());

        return { repoFullName, localDir: finalDir };

    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch { }
    }
}

/**
 * Interactive mode - prompts user for all options
 */
export async function createAngularRepoInteractive(rl, defaultOutput = process.cwd()) {
    ensureGitHubCLI();

    const username = getUsername();
    const orgs = getOrganizations();

    // Get repo name
    let name = await question(rl, "📝 Repository name: ");
    name = name.trim();
    if (!name) throw new Error("Repository name is required");

    // Get organization
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
            owner = (await question(rl, "Enter organization name: ")).trim() || username;
        }
    }

    // Get visibility
    const isPrivate = await confirm(rl, "\n🔒 Create as private repository?");

    // Get output directory
    let outputDir = await question(rl, `\n📁 Output directory (${defaultOutput}): `);
    outputDir = outputDir.trim() || defaultOutput;

    return createAngularRepo({ name, owner, outputDir, isPrivate });
}

// Run standalone if executed directly
const isMainModule = process.argv[1]?.includes("create-repo");
if (isMainModule) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    createAngularRepoInteractive(rl)
        .then(result => {
            console.log(`\n✅ Created: ${result.repoFullName}`);
            console.log(`   📁 ${result.localDir}\n`);
            rl.close();
        })
        .catch(err => {
            console.error("❌ Error:", err.message);
            rl.close();
            process.exit(1);
        });
}
