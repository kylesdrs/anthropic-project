"""Configuration management for Gmail Job Monitor."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration loaded from environment variables."""

    # Paths
    BASE_DIR = Path(__file__).parent
    DATA_DIR = BASE_DIR / "data"
    CREDENTIALS_DIR = BASE_DIR / "credentials"

    # Anthropic API
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

    # Gmail API
    GMAIL_CREDENTIALS_PATH = os.getenv(
        "GMAIL_CREDENTIALS_PATH", str(CREDENTIALS_DIR / "gmail_credentials.json")
    )
    GMAIL_TOKEN_PATH = str(CREDENTIALS_DIR / "gmail_token.json")

    # Google Docs
    GOOGLE_DOCS_FOLDER_ID = os.getenv("GOOGLE_DOCS_FOLDER_ID", "")

    # Email filtering
    EMAIL_SUBJECT_FILTER = os.getenv("EMAIL_SUBJECT_FILTER", "Upwork")
    EMAIL_SENDER_FILTER = os.getenv("EMAIL_SENDER_FILTER", "")

    # Polling
    POLL_INTERVAL_MINUTES = int(os.getenv("POLL_INTERVAL_MINUTES", "60"))

    # Data files
    RESUME_FILE = DATA_DIR / "resume.txt"
    PAST_PROJECTS_FILE = DATA_DIR / "past_projects.json"
    GRADING_CRITERIA_FILE = DATA_DIR / "grading_criteria.json"
    PROCESSED_EMAILS_FILE = DATA_DIR / "processed_emails.json"

    @classmethod
    def validate(cls) -> list[str]:
        """Validate configuration and return list of errors."""
        errors = []

        if not cls.ANTHROPIC_API_KEY:
            errors.append("ANTHROPIC_API_KEY is not set")

        if not Path(cls.GMAIL_CREDENTIALS_PATH).exists():
            errors.append(
                f"Gmail credentials file not found at {cls.GMAIL_CREDENTIALS_PATH}"
            )

        if not cls.RESUME_FILE.exists():
            errors.append(f"Resume file not found at {cls.RESUME_FILE}")

        if not cls.PAST_PROJECTS_FILE.exists():
            errors.append(f"Past projects file not found at {cls.PAST_PROJECTS_FILE}")

        if not cls.GRADING_CRITERIA_FILE.exists():
            errors.append(
                f"Grading criteria file not found at {cls.GRADING_CRITERIA_FILE}"
            )

        return errors

    @classmethod
    def ensure_directories(cls):
        """Create necessary directories if they don't exist."""
        cls.DATA_DIR.mkdir(exist_ok=True)
        cls.CREDENTIALS_DIR.mkdir(exist_ok=True)
