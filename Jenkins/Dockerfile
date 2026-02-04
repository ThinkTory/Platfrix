FROM jenkins/jenkins:lts

USER root

# Optional: install Docker CLI inside Jenkins container
RUN apt-get update && \
    apt-get install -y docker.io && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

USER jenkins
