# GitHub Actions Setup Guide

This repository includes automated CI/CD workflows for building and publishing the VS Code extension.

## Workflows Created

### 1. **Publish Extension** (`.github/workflows/publish-extension.yml`)
- **Triggers**: Push to `master` or `main` branch
- **Actions**: 
  - Builds extension
  - Creates GitHub release with VSIX file
  - Publishes to VS Code Marketplace (if token provided)

### 2. **Version Bump** (`.github/workflows/version-bump.yml`)
- **Triggers**: Manual workflow dispatch
- **Actions**: 
  - Bumps version (patch/minor/major)
  - Commits changes and creates git tag
  - Triggers publish workflow automatically

### 3. **Test Build** (`.github/workflows/test-build.yml`)
- **Triggers**: Pull requests and feature branches
- **Actions**: 
  - Tests compilation
  - Builds test VSIX package
  - Uploads as artifact for review

## Setup Instructions

### Step 1: Repository Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these repository secrets:

#### Required for Marketplace Publishing:
- **Name**: `VSCE_TOKEN`
- **Value**: Your VS Code Marketplace Personal Access Token
- **How to get**:
  1. Go to [VS Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
  2. Click your publisher name → **User settings** → **Personal access tokens**
  3. Create token with **Marketplace (publish)** scope
  4. Copy the token value

### Step 2: Enable Actions

1. Go to repository → **Actions** tab
2. Enable workflows if prompted
3. All workflows should now be visible

### Step 3: Test the Setup

#### Option A: Manual Version Bump
1. Go to **Actions** tab → **Auto Version Bump** workflow
2. Click **Run workflow** → Select version type → **Run workflow**
3. This will bump version and trigger the publish workflow

#### Option B: Direct Push
1. Make any change to code
2. Push to `master`/`main` branch
3. Watch the **Build and Publish** workflow run

## Workflow Behavior

### Without VSCE_TOKEN:
- ✅ Builds extension
- ✅ Creates GitHub release
- ✅ Uploads VSIX file
- ⚠️ Skips marketplace publishing

### With VSCE_TOKEN:
- ✅ Builds extension  
- ✅ Creates GitHub release
- ✅ Uploads VSIX file
- ✅ Publishes to VS Code Marketplace

## Manual Release Process

If you prefer manual control:

1. **Bump version manually**:
   ```bash
   npm version patch  # or minor/major
   git push && git push --tags
   ```

2. **Trigger publish workflow**:
   - Push to master branch, or
   - Go to Actions → **Build and Publish** → **Run workflow**

## Monitoring

- **Action status**: Check the **Actions** tab for workflow runs
- **Releases**: Check **Releases** section for created releases  
- **Marketplace**: Check [VS Code Marketplace](https://marketplace.visualstudio.com/manage) for published extensions

## Troubleshooting

- **Build fails**: Check Node.js version compatibility
- **Publish fails**: Verify VSCE_TOKEN is valid and has correct permissions
- **Version conflicts**: Ensure version numbers are properly incremented
- **Missing files**: Check `.vscodeignore` for excluded files