#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

function printUsage() {
  console.log(`
Usage: node create-code-repo.mjs <repo-name> [options]

Arguments:
  repo-name     Name of the repository (will also be the Angular app name)

Options:
  --org <name>     GitHub organization (default: your personal account)
  --output <dir>   Directory to create project in (default: current directory)
  --private        Create a private repository (default: public)

Examples:
  node create-code-repo.mjs my-app
  node create-code-repo.mjs my-app --org ThinkTory
  node create-code-repo.mjs my-app --output D:\\Amir --private
`);
}

function parseArgs(args) {
  const result = { name: null, org: null, output: process.cwd(), private: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--org" && args[i + 1]) {
      result.org = args[++i];
    } else if (arg === "--output" && args[i + 1]) {
      result.output = args[++i];
    } else if (arg === "--private") {
      result.private = true;
    } else if (!arg.startsWith("--") && !result.name) {
      result.name = arg;
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name) {
    printUsage();
    process.exit(1);
  }

  // Check if gh CLI is installed
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

  // Check if gh CLI is authenticated
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

  // Get GitHub username if no org specified
  let owner = args.org;
  if (!owner) {
    try {
      owner = run("gh api user -q .login", process.cwd(), true).trim();
    } catch {
      console.error("❌ Could not determine GitHub username");
      process.exit(1);
    }
  }

  const repoFullName = `${owner}/${args.name}`;
  const finalDir = path.join(args.output, args.name);
  const tempDir = path.join(os.tmpdir(), `angular-scaffold-${Date.now()}`);
  const tempProject = path.join(tempDir, args.name);

  console.log(`\n🎯 Will create: ${repoFullName}`);
  console.log(`   📁 Local path: ${finalDir}\n`);

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

    // 3) Initialize git IN TEMP (TEMP folder is usually excluded from Windows Defender)
    console.log("🚀 Initializing git in temp directory...");
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

    console.log(`\n✅ Successfully created Angular project with GitHub repository!`);
    console.log(`   📁 Local: ${finalDir}`);
    console.log(`   🔗 GitHub: https://github.com/${repoFullName}`);
    console.log(`\n   Next steps:`);
    console.log(`   cd "${finalDir}"`);
    console.log(`   npm install`);
    console.log(`   npm start`);

  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { }
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
