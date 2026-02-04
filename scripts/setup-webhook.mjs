#!/usr/bin/env node
/**
 * Setup Webhook Script
 * Creates GitHub webhook pointing to Jenkins
 */
import { run } from "./create-repo.mjs";

/**
 * Setup GitHub webhook for Jenkins
 * @param {Object} options
 * @param {string} options.repoFullName - Full repository name (owner/repo)
 * @param {string} options.jenkinsUrl - Jenkins URL (e.g., http://jenkins.example.com)
 * @param {string} options.webhookSecret - Optional webhook secret
 */
export async function setupWebhook(options) {
    const { repoFullName, jenkinsUrl, webhookSecret } = options;

    if (!jenkinsUrl) {
        console.log("\n⚠️  No Jenkins URL provided. Skipping webhook setup.");
        console.log("   You can set it up manually in GitHub repo settings.");
        return { skipped: true };
    }

    console.log("\n🔗 Setting up GitHub webhook...");

    const webhookUrl = `${jenkinsUrl.replace(/\/$/, "")}/github-webhook/`;

    // Build webhook config
    const webhookConfig = {
        name: "web",
        active: true,
        events: ["push", "pull_request"],
        config: {
            url: webhookUrl,
            content_type: "json",
            insecure_ssl: "0"
        }
    };

    if (webhookSecret) {
        webhookConfig.config.secret = webhookSecret;
    }

    try {
        // Create webhook using gh api
        const configJson = JSON.stringify(webhookConfig).replace(/"/g, '\\"');
        run(
            `gh api repos/${repoFullName}/hooks -X POST -H "Accept: application/vnd.github+json" --input - <<< "${configJson}"`,
            process.cwd(),
            true
        );

        console.log(`   ✅ Webhook created: ${webhookUrl}`);
        return { webhookUrl, created: true };
    } catch (err) {
        // Try alternative method for Windows
        try {
            const tempFile = `${process.env.TEMP || "/tmp"}/webhook-config.json`;
            const fs = await import("node:fs");
            fs.writeFileSync(tempFile, JSON.stringify(webhookConfig));

            run(`gh api repos/${repoFullName}/hooks -X POST --input "${tempFile}"`, process.cwd(), true);

            fs.unlinkSync(tempFile);
            console.log(`   ✅ Webhook created: ${webhookUrl}`);
            return { webhookUrl, created: true };
        } catch (err2) {
            console.log(`   ⚠️  Could not create webhook automatically.`);
            console.log(`   Please create it manually in GitHub:`);
            console.log(`   Settings → Webhooks → Add webhook`);
            console.log(`   Payload URL: ${webhookUrl}`);
            return { webhookUrl, created: false, manual: true };
        }
    }
}

// Run standalone if executed directly
const isMainModule = process.argv[1]?.includes("setup-webhook");
if (isMainModule) {
    const repoFullName = process.argv[2];
    const jenkinsUrl = process.argv[3];

    if (!repoFullName) {
        console.error("Usage: node setup-webhook.mjs <owner/repo> [jenkins-url]");
        process.exit(1);
    }

    setupWebhook({ repoFullName, jenkinsUrl })
        .then(result => {
            if (result.created) {
                console.log("\n✅ Webhook setup complete!");
            }
        })
        .catch(err => {
            console.error("❌ Error:", err.message);
            process.exit(1);
        });
}
