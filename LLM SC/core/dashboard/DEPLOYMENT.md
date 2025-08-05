# GitHub Actions Deployment Setup

This repository uses GitHub Actions to automatically deploy to AWS when code is pushed to the main branch.

## 🔧 Initial Setup Required

### 1. GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_HOST` | `51.20.74.192` | Your AWS EC2 IP address |
| `AWS_USERNAME` | `ubuntu` | SSH username (usually ubuntu or ec2-user) |
| `AWS_SSH_KEY` | `[Your Private Key]` | Contents of your .pem file |

### 2. AWS SSH Key Setup

To get your SSH private key:
1. Find your `.pem` file (usually in Downloads)
2. Open it in a text editor
3. Copy the ENTIRE contents including:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   [key content]
   -----END RSA PRIVATE KEY-----
   ```
4. Paste this as the `AWS_SSH_KEY` secret

### 3. AWS Security Group

Ensure your AWS instance allows SSH:
- Go to EC2 → Security Groups
- Find your instance's security group
- Add inbound rule: Type=SSH, Port=22, Source=0.0.0.0/0

## 🚀 How It Works

1. **Push to main branch** → Triggers deployment
2. **Build** → Compiles TypeScript to JavaScript
3. **Package** → Creates deployment package with built files
4. **Upload** → Sends files to AWS via SCP
5. **Deploy** → Installs on server and restarts service
6. **Verify** → Tests the deployment

## 🎯 Manual Deployment

You can also trigger deployment manually:
1. Go to Actions tab in GitHub
2. Select "Deploy Dashboard to AWS"
3. Click "Run workflow"

## 📋 Deployment Checklist

- [ ] GitHub secrets configured
- [ ] AWS security group allows SSH (port 22)
- [ ] EC2 instance is running
- [ ] Service account files are in repository
- [ ] Code pushed to main branch

## 🧪 Testing

After deployment, test:
```bash
curl https://admin.swiftclinic.ai/api/health
```

Should return health status with webhook integration enabled.