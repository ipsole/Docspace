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
