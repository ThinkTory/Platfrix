FROM jenkins/jenkins:lts

USER root

# Install Docker CLI, Node.js 20, and build tools
RUN apt-get update && \
    apt-get install -y docker.io curl gnupg && \
    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    # Cleanup
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN node --version && npm --version && docker --version

USER jenkins
