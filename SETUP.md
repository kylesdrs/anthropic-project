# Gmail Job Monitor - Setup Guide

This guide walks you through setting up the Gmail Job Monitor for Upwork job postings.

## Prerequisites

- Python 3.10 or higher
- A Google account (for Gmail and Google Docs access)
- An Anthropic API key

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# 3. Set up Google API credentials (see below)

# 4. Customize your data files
# Edit data/resume.txt, data/past_projects.json, data/grading_criteria.json

# 5. Run the monitor
python main.py --once    # Run once
python main.py           # Run on schedule
```

## Step-by-Step Setup

### 1. Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key and add it to your `.env` file:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### 2. Set Up Google Cloud Project

You need OAuth credentials to access Gmail and Google Docs.

#### Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Note the project name for later

#### Enable Required APIs

1. Go to **APIs & Services > Library**
2. Search for and enable:
   - Gmail API
   - Google Docs API
   - Google Drive API

#### Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. Choose **External** user type (or Internal if using Google Workspace)
3. Fill in the required fields:
   - App name: "Gmail Job Monitor"
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive.file`
5. Add your email as a test user
6. Complete the setup

#### Create OAuth Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Desktop app** as application type
4. Name it "Gmail Job Monitor"
5. Download the JSON file
6. Save it as `credentials/gmail_credentials.json`

### 3. Configure Your Data Files

#### Resume (`data/resume.txt`)

Replace the sample resume with your dad's actual resume. Format it as plain text with clear sections. The AI will use this to generate tailored versions.

Tips:
- Include all relevant skills and experience
- Use clear section headers
- Include past project highlights
- List technical skills and tools

#### Past Projects (`data/past_projects.json`)

Add 3-5 examples of successful past Upwork projects. Each entry should include:

```json
{
  "title": "Project Name",
  "description": "What you built and the challenges solved",
  "skills": ["Python", "Django", "etc"],
  "duration": "How long it took",
  "budget": "What you charged",
  "outcome": "Results and impact",
  "client_feedback": "Quote from client review",
  "why_successful": "What made this project go well"
}
```

#### Grading Criteria (`data/grading_criteria.json`)

Customize the grading criteria to match your preferences:

- Adjust rate preferences in `rate_preferences`
- Modify `preferred_project_types` and `avoid_project_types`
- Update `positive_signals` and `red_flags`
- Customize grade definitions in `grades`

### 4. First Run

```bash
# Validate your setup
python main.py --validate

# Run once to test
python main.py --once
```

On first run, your browser will open to authenticate with Google. Grant the requested permissions.

## Running Options

### Run Once
```bash
python main.py --once
```
Checks for new emails, processes them, and exits.

### Run on Schedule
```bash
python main.py
# or with custom interval
python main.py --interval 30  # every 30 minutes
```
Runs continuously, checking for new emails at the specified interval.

### Run as Background Service (Linux)

Create a systemd service for continuous operation:

```bash
# /etc/systemd/system/gmail-job-monitor.service
[Unit]
Description=Gmail Job Monitor
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/gmail-job-monitor
ExecStart=/usr/bin/python3 main.py
Restart=always
RestartSec=60

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable gmail-job-monitor
sudo systemctl start gmail-job-monitor
```

### Run with Cron (Alternative)

```bash
# Run every hour
0 * * * * cd /path/to/gmail-job-monitor && python main.py --once >> logs/monitor.log 2>&1
```

## Promotion Sorter

The promotion sorter helps you clean up your inbox by analyzing promotional emails and recommending which ones to unsubscribe from.

### Quick Start

```bash
# Analyze promotional emails from the last 30 days
python promotion_sorter.py

# Analyze more emails from a longer time period
python promotion_sorter.py --max-emails 100 --days 60

# Only analyze unread promotional emails
python promotion_sorter.py --unread-only

# Quiet mode (just summary, no full report)
python promotion_sorter.py --quiet
```

### Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-emails` | 50 | Maximum number of emails to analyze |
| `--days` | 30 | How many days back to look (0 = all time) |
| `--unread-only` | false | Only analyze unread emails |
| `--output` | data/promotion_analysis.json | Output file for results |
| `--quiet` | false | Show only summary, not full report |

### How It Works

1. **Connects to Gmail** using your existing OAuth credentials
2. **Fetches promotional emails** from Gmail's Promotions category
3. **Analyzes each email** with Claude AI to determine:
   - Sender/company name and category
   - Email type (newsletter, marketing, transactional, etc.)
   - Usefulness score (0-100)
   - Spam indicators and value indicators
   - Estimated sending frequency
4. **Makes recommendations**:
   - **Keep**: Valuable newsletters, important updates from services you use
   - **Unsubscribe**: Aggressive marketing, companies you don't engage with
   - **Review**: Could be valuable but needs your input
5. **Extracts unsubscribe links** when available for easy unsubscription

### Output

The tool generates:
- A detailed console report with all recommendations
- A JSON file (`data/promotion_analysis.json`) with full analysis data

### Example Output

```
============================================================
PROMOTIONAL EMAIL ANALYSIS REPORT
============================================================

Total emails analyzed: 50
  - Recommended to KEEP: 12
  - Recommended to UNSUBSCRIBE: 28
  - Needs REVIEW: 10

------------------------------------------------------------
RECOMMENDED UNSUBSCRIBES
------------------------------------------------------------

1. RandomStore (Retail)
   Email: deals@randomstore.com
   Type: Marketing | Frequency: Daily
   Reason: Aggressive daily marketing with no user engagement
   Spam indicators: high frequency, generic offers
   Unsubscribe: https://randomstore.com/unsubscribe?...
```

## Cloud Deployment Options

### Render

1. Create a new Background Worker
2. Connect your GitHub repo
3. Set environment variables (ANTHROPIC_API_KEY)
4. Upload credentials files as secrets

### Railway

1. Create new project from GitHub
2. Add environment variables
3. Configure as a worker service

### AWS Lambda (Advanced)

Can be adapted to run as a Lambda function triggered by CloudWatch Events.

## Troubleshooting

### "Gmail credentials file not found"
Make sure you downloaded the OAuth credentials and saved them to `credentials/gmail_credentials.json`

### "Token has been expired or revoked"
Delete `credentials/gmail_token.json` and `credentials/docs_token.json`, then run again to re-authenticate.

### "ANTHROPIC_API_KEY is not set"
Check your `.env` file and make sure the API key is correct.

### "No emails found"
- Check your Gmail for Upwork emails
- Verify the EMAIL_SUBJECT_FILTER in `.env` matches your Upwork email subjects
- Make sure emails are unread (the monitor only processes unread emails)

### Rate Limits
If you hit rate limits:
- For Gmail: reduce polling frequency
- For Claude: the script handles this automatically, but very high volumes may need throttling

## File Structure

```
gmail-job-monitor/
├── main.py                  # Main orchestration script (Job Monitor)
├── promotion_sorter.py      # Promotion sorter CLI tool
├── config.py                # Configuration management
├── gmail_monitor.py         # Gmail API integration (Job Monitor)
├── job_extractor.py         # Email content parsing (Job Monitor)
├── claude_analyzer.py       # Claude API integration (Job Monitor)
├── promotion_analyzer.py    # Promotion analysis with Claude
├── docs_writer.py           # Google Docs output
├── requirements.txt         # Python dependencies
├── .env                     # Environment variables (create from .env.example)
├── .env.example             # Environment template
├── SETUP.md                 # This file
├── credentials/
│   ├── gmail_credentials.json    # OAuth client credentials
│   ├── gmail_token.json          # Gmail auth token (auto-generated)
│   └── docs_token.json           # Docs auth token (auto-generated)
└── data/
    ├── resume.txt                # Your resume
    ├── past_projects.json        # Past project examples
    ├── grading_criteria.json     # Job grading criteria
    ├── processed_emails.json     # Tracking file (auto-generated)
    └── promotion_analysis.json   # Promotion analysis results (auto-generated)
```

## Security Notes

- Never commit `.env` or `credentials/` to version control
- The OAuth tokens give access to your Gmail and Google Docs
- Keep your Anthropic API key secure
- Review the code before running to understand what access it requires

## Support

For issues with this tool, check the code comments or create an issue in the repository.
