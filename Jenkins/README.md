# Jenkins CI/CD Setup

This folder contains the Jenkins infrastructure for CI/CD pipelines.

## Quick Start

### 1. Start Jenkins

```bash
cd Jenkins
docker-compose up -d --build
```

### 2. Get Initial Admin Password

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

### 3. Access Jenkins

Open http://localhost:8080 and complete the setup wizard.

### 4. Configure Credentials

1. Go to **Manage Jenkins** → **Credentials**
2. Add credential with ID: `docker-hub-credentials`
   - Username: Your Docker Hub username
   - Password: Your Docker Hub access token

### 5. Configure GitHub Webhook

In your GitHub repository:
1. Go to **Settings** → **Webhooks** → **Add webhook**
2. Payload URL: `http://YOUR_JENKINS_URL/github-webhook/`
3. Content type: `application/json`
4. Events: Select "Just the push event"

### 6. Create Pipeline Job

1. **New Item** → **Pipeline**
2. **Build Triggers**: Check "GitHub hook trigger for GITScm polling"
3. **Pipeline**: 
   - Definition: Pipeline script from SCM
   - SCM: Git
   - Repository URL: Your repo URL
   - Script Path: `pipelines/angular/Jenkinsfile`

## Folder Structure

```
Jenkins/
├── Dockerfile          # Jenkins image with Node.js & Docker
├── docker-compose.yml  # Docker Compose for Jenkins
├── config/
│   └── plugins.txt     # Required plugins
└── README.md           # This file

pipelines/
└── angular/
    └── Jenkinsfile     # Angular CI/CD pipeline
```

## Pipeline Stages

1. **Checkout** - Clone repository
2. **Install Dependencies** - `npm ci`
3. **Build Application** - `npm run build --configuration=production`
4. **Build Docker Image** - Build and tag image
5. **Push to Docker Hub** - Push tagged images
