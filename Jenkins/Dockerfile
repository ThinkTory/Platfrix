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

# Create config directory for JCasC
RUN mkdir -p /var/jenkins_config && chown jenkins:jenkins /var/jenkins_config

USER jenkins

# Copy plugins list and install them
COPY config/plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Copy Configuration as Code file
COPY config/jenkins.yaml /var/jenkins_config/jenkins.yaml

# Set JCasC environment variable
ENV CASC_JENKINS_CONFIG=/var/jenkins_config/jenkins.yaml
