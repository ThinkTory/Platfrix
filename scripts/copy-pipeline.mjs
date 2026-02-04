#!/usr/bin/env node
/**
 * Copy Pipeline Script
 * Copies Jenkinsfile to a repository and commits
 */
import fs from "node:fs";
import path from "node:path";
import { run } from "./create-repo.mjs";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const PLATFRIX_ROOT = path.dirname(SCRIPT_DIR);

/**
 * Copy Jenkinsfile to target repository
 * @param {Object} options
 * @param {string} options.localDir - Local repository directory
 * @param {string} options.pipelineType - Pipeline type (default: 'angular')
 */
export async function copyPipeline(options) {
    const { localDir, pipelineType = "angular" } = options;

    console.log("\n📋 Copying Jenkinsfile to repository...");

    // Source Jenkinsfile
    const sourceJenkinsfile = path.join(PLATFRIX_ROOT, "pipelines", pipelineType, "Jenkinsfile");

    if (!fs.existsSync(sourceJenkinsfile)) {
        throw new Error(`Jenkinsfile not found: ${sourceJenkinsfile}`);
    }

    // Destination
    const destJenkinsfile = path.join(localDir, "Jenkinsfile");

    // Copy Jenkinsfile
    fs.copyFileSync(sourceJenkinsfile, destJenkinsfile);
    console.log(`   ✅ Copied Jenkinsfile`);

    // Commit and push
    console.log("📤 Committing and pushing...");
    run(`git add Jenkinsfile`, localDir);
    run(`git commit -m "ci: add Jenkins pipeline"`, localDir);
    run(`git push`, localDir);

    console.log("   ✅ Jenkinsfile pushed to repository");

    return { jenkinsfilePath: destJenkinsfile };
}

// Run standalone if executed directly
const isMainModule = process.argv[1]?.includes("copy-pipeline");
if (isMainModule) {
    const localDir = process.argv[2];
    if (!localDir) {
        console.error("Usage: node copy-pipeline.mjs <repo-dir>");
        process.exit(1);
    }

    copyPipeline({ localDir })
        .then(() => console.log("\n✅ Pipeline copied successfully!"))
        .catch(err => {
            console.error("❌ Error:", err.message);
            process.exit(1);
        });
}
