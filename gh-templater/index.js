#!/usr/bin/env node
import { execSync } from "node:child_process";

// ---- INPUT ----
const repoName = process.argv[2];
if (!repoName) {
  console.error("Usage: gh-templater <repo-name>");
  process.exit(1);
}

// ---- CONFIG (CHANGE THESE ONCE) ----
const TEMPLATE_REPO = "ThinkTory/Platfrix-templateRepo"; // template repo
const VISIBILITY = "public"; // "private" or "public"
const CLONE = false; // true or false

// ---- AUTO-DETECT OWNER ----
let owner;
try {
  owner = execSync("gh api user -q .login", { encoding: "utf8" }).trim();
} catch {
  console.error("GitHub CLI not authenticated. Run: gh auth login");
  process.exit(1);
}

// ---- CREATE REPO ----
const fullName = `${owner}/${repoName}`;

const flags = [
  `--template ${TEMPLATE_REPO}`,
  VISIBILITY === "public" ? "--public" : "--private",
  CLONE ? "--clone" : ""
].filter(Boolean).join(" ");

execSync(`gh repo create ${fullName} ${flags}`, { stdio: "inherit" });
