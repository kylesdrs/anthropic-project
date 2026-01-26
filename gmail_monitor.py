"""Gmail API integration for monitoring Upwork job emails."""

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import Config

# Gmail API scopes - readonly access to messages
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class GmailMonitor:
    """Monitor Gmail for Upwork job posting emails."""

    def __init__(self):
        self.service = None
        self.processed_emails: set[str] = set()
        self._load_processed_emails()

    def _load_processed_emails(self):
        """Load previously processed email IDs from file."""
        if Config.PROCESSED_EMAILS_FILE.exists():
            with open(Config.PROCESSED_EMAILS_FILE, "r") as f:
                data = json.load(f)
                self.processed_emails = set(data.get("processed_ids", []))

    def _save_processed_emails(self):
        """Save processed email IDs to file."""
        Config.DATA_DIR.mkdir(exist_ok=True)
        with open(Config.PROCESSED_EMAILS_FILE, "w") as f:
            json.dump({"processed_ids": list(self.processed_emails)}, f, indent=2)

    def authenticate(self) -> bool:
        """Authenticate with Gmail API using OAuth2."""
        creds = None

        # Load existing token if available
        token_path = Path(Config.GMAIL_TOKEN_PATH)
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        # Refresh or get new credentials if needed
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not Path(Config.GMAIL_CREDENTIALS_PATH).exists():
                    print(f"Error: Gmail credentials file not found at {Config.GMAIL_CREDENTIALS_PATH}")
                    print("Please download OAuth credentials from Google Cloud Console.")
                    return False

                flow = InstalledAppFlow.from_client_secrets_file(
                    Config.GMAIL_CREDENTIALS_PATH, SCOPES
                )
                creds = flow.run_local_server(port=0)

            # Save credentials for next run
            token_path.parent.mkdir(exist_ok=True)
            with open(token_path, "w") as token:
                token.write(creds.to_json())

        self.service = build("gmail", "v1", credentials=creds)
        return True

    def search_emails(
        self,
        subject_filter: Optional[str] = None,
        sender_filter: Optional[str] = None,
        max_results: int = 50,
    ) -> list[dict]:
        """
        Search for emails matching the specified criteria.

        Args:
            subject_filter: Filter emails by subject containing this string
            sender_filter: Filter emails by sender address
            max_results: Maximum number of results to return

        Returns:
            List of email dictionaries with id, subject, sender, date, and body
        """
        if not self.service:
            raise RuntimeError("Gmail service not authenticated. Call authenticate() first.")

        # Build search query
        query_parts = []
        if subject_filter:
            query_parts.append(f"subject:{subject_filter}")
        if sender_filter:
            query_parts.append(f"from:{sender_filter}")
        query_parts.append("is:unread")  # Only get unread emails

        query = " ".join(query_parts)
        print(f"Searching Gmail with query: {query}")

        try:
            # Search for messages
            results = (
                self.service.users()
                .messages()
                .list(userId="me", q=query, maxResults=max_results)
                .execute()
            )

            messages = results.get("messages", [])
            print(f"Found {len(messages)} matching emails")

            emails = []
            for msg in messages:
                # Skip already processed emails
                if msg["id"] in self.processed_emails:
                    continue

                email_data = self._get_email_details(msg["id"])
                if email_data:
                    emails.append(email_data)

            return emails

        except HttpError as error:
            print(f"Gmail API error: {error}")
            return []

    def _get_email_details(self, message_id: str) -> Optional[dict]:
        """Get full details of an email by ID."""
        try:
            message = (
                self.service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )

            headers = message.get("payload", {}).get("headers", [])
            header_dict = {h["name"].lower(): h["value"] for h in headers}

            # Extract body
            body = self._extract_body(message.get("payload", {}))

            return {
                "id": message_id,
                "subject": header_dict.get("subject", ""),
                "sender": header_dict.get("from", ""),
                "date": header_dict.get("date", ""),
                "body": body,
                "snippet": message.get("snippet", ""),
            }

        except HttpError as error:
            print(f"Error getting email {message_id}: {error}")
            return None

    def _extract_body(self, payload: dict) -> str:
        """Extract the email body from the message payload."""
        body = ""

        # Check for direct body data
        if "body" in payload and payload["body"].get("data"):
            body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8")
            return body

        # Check for multipart content
        if "parts" in payload:
            for part in payload["parts"]:
                mime_type = part.get("mimeType", "")

                # Prefer text/plain, fall back to text/html
                if mime_type == "text/plain" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode(
                        "utf-8"
                    )
                    break
                elif mime_type == "text/html" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode(
                        "utf-8"
                    )
                    # Continue looking for text/plain

                # Handle nested multipart
                if "parts" in part:
                    nested_body = self._extract_body(part)
                    if nested_body:
                        body = nested_body
                        break

        return body

    def mark_as_processed(self, email_id: str):
        """Mark an email as processed to avoid reprocessing."""
        self.processed_emails.add(email_id)
        self._save_processed_emails()

    def get_new_upwork_emails(self) -> list[dict]:
        """Get new Upwork job posting emails that haven't been processed."""
        return self.search_emails(
            subject_filter=Config.EMAIL_SUBJECT_FILTER,
            sender_filter=Config.EMAIL_SENDER_FILTER or None,
        )


if __name__ == "__main__":
    # Test the Gmail monitor
    monitor = GmailMonitor()

    if monitor.authenticate():
        print("Successfully authenticated with Gmail!")
        emails = monitor.get_new_upwork_emails()
        print(f"\nFound {len(emails)} new Upwork emails:")
        for email in emails:
            print(f"  - {email['subject'][:60]}...")
    else:
        print("Failed to authenticate with Gmail")
