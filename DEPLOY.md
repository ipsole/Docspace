# Deployment & Repository Configuration

## GitHub Repository
- **Remote URL**: `git@github.com:ipsole/Docspace.git`
- **Default Branch**: `main`

## Dedicated SSH Deploy Key
To enable seamless and automated pushes by any AI assistant or developer working on this workspace without requiring external interactive logins, a dedicated Ed25519 SSH deploy key pair is stored in the local `.ssh/` folder:
- **Private Key**: `.ssh/docspace_deploy_key` (persisted locally, excluded by `.gitignore`)
- **Public Key**: `.ssh/docspace_deploy_key.pub`
- **Public Key String**:
  ```text
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEKszchraJuUBL1/YUG1F6cKzrtvcYXct+6Jo3uZ33E/ docspace-deploy-key
  ```

## Local Git Setup for AI Assistants
Git is configured in this repository to automatically use this key for all operations against `origin`:
```bash
git config core.sshCommand "ssh -i $(pwd)/.ssh/docspace_deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
```

### Quick Commands
To push changes to GitHub:
```bash
git add .
git commit -m "Your descriptive commit message"
git push -u origin main
```

---

## Vercel Deployment Guide

### 1. Import Project
- Connect your GitHub account and import `ipsole/Docspace`.
- Framework Preset: **Next.js**
- Root Directory: `./`
- Build Command: `npm run build`

### 2. Environment Variables Checklist
Add these in **Vercel Project Settings > Environment Variables**:

| Variable | Description / Example |
| :--- | :--- |
| `DATA_BACKEND` | `firestore` |
| `STORAGE_BACKEND` | `r2` |
| `FIREBASE_PROJECT_ID` | Your Firebase Project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email |
| `FIREBASE_PRIVATE_KEY` | Firebase private key (`-----BEGIN PRIVATE KEY...`) |
| *or* `FIREBASE_SERVICE_ACCOUNT_KEY` | *(Alternative)* Entire service account JSON content as a single string |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key |
| `R2_BUCKET_NAME` | `docspace` |
| `R2_PUBLIC_URL` | Public R2 domain (e.g. `https://pub-...r2.dev`) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web Client API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web Auth Domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Web Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
| `OWNER_GOOGLE_EMAIL` | Owner Google Email for Google Auth admin access |

