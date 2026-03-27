# 🚀 How to Set Up Auto-Deploy (GitHub Actions)

This guide explains how to connect GitHub to Fly.io so that every time you run `git push`, your app automatically updates on the live internet without needing to type `fly deploy`.

## Phase 1: Give GitHub the Keys to Fly.io
GitHub needs permission to push code to your Fly.io server.

1. Open your terminal and run: 
   ```bash
   fly tokens create deploy -x 999999h
   ```
2. Copy the long token string it generates.
3. Go to your GitHub repository in your browser.
4. Click **Settings** > **Secrets and variables** (on the left sidebar) > **Actions**.
5. Click **New repository secret**.
6. Name it exactly `FLY_API_TOKEN` and paste your token into the Secret box. 
7. Click **Add secret**.

## Phase 2: Give Your Terminal the Keys to GitHub
You need to tell GitHub that your local terminal is allowed to create automation scripts.

1. Go to GitHub **Settings** (click your profile picture) > **Developer Settings** > **Personal access tokens** > **Tokens (classic)**.
2. Click your current token (or generate a new one).
3. Check the box for **`workflow`** (this allows updating GitHub Actions).
4. Click **Update token**.

## Phase 3: Add the Automation Script
Now you just need to add the script to your codebase that tells GitHub what to do.

1. In your project folder, create a folder named `.github`, and inside that, a folder named `workflows`.
2. Inside `workflows`, create a file named `fly-deploy.yml`.
3. Paste this exact script into the file:

\`\`\`yaml
name: Fly Deploy
on:
  push:
    branches:
      - main
jobs:
  deploy:
    name: Deploy app
    runs-on: ubuntu-latest
    concurrency: deploy-group
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
\`\`\`

4. Finally, run your git commands:
   ```bash
   git add .
   git commit -m "chore: setup github actions auto-deploy"
   git push
   ```

From now on, GitHub will automatically handle the deployments!
