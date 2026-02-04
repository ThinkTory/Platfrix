#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

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

function printUsage() {
  console.log(`
Usage: node create-code-repo.mjs [repo-name] [options]

If repo-name is not provided, you will be prompted for it.

Options:
  --org <name>     GitHub organization (skip prompt)
  --output <dir>   Directory to create project in (default: current directory)
  --private        Create a private repository (default: public)
  --no-interactive Skip all prompts (requires repo-name)

Examples:
  node create-code-repo.mjs                           # Interactive mode
  node create-code-repo.mjs my-app                    # Prompts for org
  node create-code-repo.mjs my-app --org ThinkTory    # Non-interactive
`);
}

function parseArgs(args) {
  const result = { name: null, org: null, output: process.cwd(), private: false, interactive: true };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--org" && args[i + 1]) {
      result.org = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      result.output = args[++i];
    } else if (arg === "--private") {
      result.private = true;
    } else if (arg === "--no-interactive") {
      result.interactive = false;
    } else if (!arg.startsWith("--") && !result.name) {
      result.name = arg;
    }
  }

  return result;
}

async function ensureGitHubCLI() {
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
      console.error("❌ Failed to install GitHub CLI. Please install manually: https://cli.github.com/");
      process.exit(1);
    }
  }

  // Check authentication
  try {
    run("gh auth status", process.cwd(), true);
  } catch {
    console.log("🔐 GitHub CLI not authenticated. Starting login process...\n");
    try {
      run("gh auth login", process.cwd());
    } catch {
      console.error("❌ GitHub authentication failed. Please try again.");
      process.exit(1);
    }
  }
}

function getUsername() {
  try {
    return run("gh api user -q .login", process.cwd(), true).trim();
  } catch {
    console.error("❌ Could not determine GitHub username");
    process.exit(1);
  }
}

function getOrganizations() {
  try {
    // Use double quotes for Windows compatibility
    const result = run('gh api user/orgs --jq ".[].login"', process.cwd(), true).trim();
    if (!result) return [];
    return result.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    // Silently return empty array if fetch fails
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Ensure GitHub CLI is ready
  await ensureGitHubCLI();

  const username = getUsername();
  const orgs = getOrganizations();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Get repo name if not provided
    if (!args.name) {
      if (!args.interactive) {
        printUsage();
        process.exit(1);
      }
      args.name = await question(rl, "📝 Repository name: ");
      if (!args.name.trim()) {
        console.error("❌ Repository name is required");
        process.exit(1);
      }
      args.name = args.name.trim();
    }

    // Get organization if not provided via --org
    let owner = args.org;
    if (!owner && args.interactive) {
      const useOrg = await confirm(rl, "\n🏢 Create in a GitHub organization?");

      if (useOrg) {
        if (orgs.length > 0) {
          // Add option to enter manually
          const options = [...orgs, "📝 Enter organization name manually"];
          const selected = await selectFromList(rl, options, "Select organization:");

          if (selected === "📝 Enter organization name manually") {
            owner = await question(rl, "Enter organization name: ");
            owner = owner.trim();
          } else {
            owner = selected;
          }
        } else {
          console.log("   (No organizations found in your account)");
          owner = await question(rl, "Enter organization name: ");
          owner = owner.trim();
        }

        if (!owner) {
          console.log("   Using personal account instead.");
          owner = username;
        }
      } else {
        owner = username;
      }
    } else if (!owner) {
      owner = username;
    }

    // Get visibility if interactive
    if (args.interactive && !args.private) {
      const makePrivate = await confirm(rl, "\n🔒 Create as private repository?");
      args.private = makePrivate;
    }

    const repoFullName = `${owner}/${args.name}`;
    const finalDir = path.join(args.output, args.name);
    const tempDir = path.join(os.tmpdir(), `angular-scaffold-${Date.now()}`);
    const tempProject = path.join(tempDir, args.name);

    console.log(`\n${"─".repeat(50)}`);
    console.log(`🎯 Repository: ${repoFullName}`);
    console.log(`📁 Local path: ${finalDir}`);
    console.log(`🔐 Visibility: ${args.private ? "Private" : "Public"}`);
    console.log(`${"─".repeat(50)}\n`);

    // Validations
    if (!fs.existsSync(args.output)) {
      console.error(`❌ Output directory "${args.output}" does not exist.`);
      process.exit(1);
    }

    if (fs.existsSync(finalDir)) {
      console.error(`❌ Directory "${finalDir}" already exists. Please remove it first.`);
      process.exit(1);
    }

    try {
      run(`gh repo view ${repoFullName}`, process.cwd(), true);
      console.error(`❌ Repository ${repoFullName} already exists on GitHub.`);
      process.exit(1);
    } catch {
      // Good - repo doesn't exist yet
    }

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1) Generate Angular project in temp dir
      console.log("📦 Creating Angular project...");
      run(
        `npx -y @angular/cli@latest new ${args.name} --routing --style=scss --standalone --strict --skip-git`,
        tempDir
      );

      // 2) Add opinionated defaults
      console.log("🔧 Adding project configurations...");
      run(`npm i -D prettier`, tempProject);

      fs.writeFileSync(
        path.join(tempProject, ".prettierrc"),
        JSON.stringify({ singleQuote: true, printWidth: 100 }, null, 2)
      );

      fs.writeFileSync(
        path.join(tempProject, ".editorconfig"),
        `root = true

[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
`
      );

      fs.writeFileSync(
        path.join(tempProject, "Dockerfile"),
        `# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run stage (static)
FROM nginx:alpine
COPY --from=build /app/dist/${args.name}/browser /usr/share/nginx/html
EXPOSE 80
`
      );

      // 3) Initialize git IN TEMP
      console.log("🚀 Initializing git...");
      await sleep(2000);
      run(`git init`, tempProject);
      run(`git add -A`, tempProject);
      run(`git commit -m "chore: initial angular scaffold"`, tempProject);

      // 4) Create GitHub repository from temp directory
      console.log("🌐 Creating GitHub repository...");
      const visibility = args.private ? "--private" : "--public";
      run(`gh repo create ${repoFullName} ${visibility} --source="${tempProject}" --remote=origin --push`, process.cwd());

      // 5) Clone the repo to the final location
      console.log(`📁 Cloning to: ${finalDir}`);
      run(`gh repo clone ${repoFullName} "${finalDir}"`, process.cwd());

      console.log(`\n${"═".repeat(50)}`);
      console.log(`✅ Successfully created Angular project!`);
      console.log(`${"═".repeat(50)}`);
      console.log(`   📁 Local: ${finalDir}`);
      console.log(`   🔗 GitHub: https://github.com/${repoFullName}`);
      console.log(`\n   Next steps:`);
      console.log(`   cd "${finalDir}"`);
      console.log(`   npm install`);
      console.log(`   npm start\n`);

    } finally {
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch { }
    }

  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
