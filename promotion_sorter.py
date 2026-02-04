#!/usr/bin/env python3
"""
Gmail Promotion Sorter - Analyze promotional emails and help you unsubscribe.

This tool connects to your Gmail, fetches promotional emails, analyzes them
with Claude AI, and provides recommendations on which ones to unsubscribe from.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import Config
from promotion_analyzer import PromotionAnalyzer, PromotionSummary, format_summary_report

# Gmail API scopes - we need modify access to potentially mark emails
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class GmailPromotionFetcher:
    """Fetch promotional emails from Gmail."""

    def __init__(self):
        self.service = None

    def authenticate(self) -> bool:
        """Authenticate with Gmail API using OAuth2."""
        creds = None
        token_path = Path(Config.GMAIL_TOKEN_PATH)

        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                print("Refreshing Gmail credentials...")
                creds.refresh(Request())
            else:
                if not Path(Config.GMAIL_CREDENTIALS_PATH).exists():
                    print(f"Error: Gmail credentials file not found at {Config.GMAIL_CREDENTIALS_PATH}")
                    print("\nTo set up Gmail API access:")
                    print("1. Go to https://console.cloud.google.com/")
                    print("2. Create a project and enable Gmail API")
                    print("3. Create OAuth 2.0 credentials (Desktop app)")
                    print("4. Download and save as credentials/gmail_credentials.json")
                    return False

                print("Starting OAuth flow - a browser window will open...")
                flow = InstalledAppFlow.from_client_secrets_file(
                    Config.GMAIL_CREDENTIALS_PATH, SCOPES
                )
                creds = flow.run_local_server(port=0)

            token_path.parent.mkdir(exist_ok=True)
            with open(token_path, "w") as token:
                token.write(creds.to_json())

        self.service = build("gmail", "v1", credentials=creds)
        return True

    def get_promotional_emails(
        self,
        max_results: int = 100,
        days_back: int = 30,
        include_read: bool = True,
    ) -> list[dict]:
        """
        Fetch promotional emails from Gmail.

        Args:
            max_results: Maximum number of emails to fetch
            days_back: How many days back to look (0 = all time)
            include_read: Whether to include already-read emails

        Returns:
            List of email dictionaries
        """
        if not self.service:
            raise RuntimeError("Gmail service not authenticated. Call authenticate() first.")

        # Build search query for promotions
        query_parts = ["category:promotions"]

        if days_back > 0:
            query_parts.append(f"newer_than:{days_back}d")

        if not include_read:
            query_parts.append("is:unread")

        query = " ".join(query_parts)
        print(f"Searching Gmail with query: {query}")

        try:
            emails = []
            page_token = None

            while len(emails) < max_results:
                results = (
                    self.service.users()
                    .messages()
                    .list(
                        userId="me",
                        q=query,
                        maxResults=min(50, max_results - len(emails)),
                        pageToken=page_token,
                    )
                    .execute()
                )

                messages = results.get("messages", [])
                if not messages:
                    break

                for msg in messages:
                    email_data = self._get_email_details(msg["id"])
                    if email_data:
                        emails.append(email_data)

                page_token = results.get("nextPageToken")
                if not page_token:
                    break

            print(f"Fetched {len(emails)} promotional emails")
            return emails

        except HttpError as error:
            print(f"Gmail API error: {error}")
            return []

    def _get_email_details(self, message_id: str) -> dict | None:
        """Get full details of an email by ID."""
        import base64

        try:
            message = (
                self.service.users()
                .messages()
                .get(userId="me", id=message_id, format="full")
                .execute()
            )

            headers = message.get("payload", {}).get("headers", [])
            header_dict = {h["name"].lower(): h["value"] for h in headers}

            body = self._extract_body(message.get("payload", {}))

            return {
                "id": message_id,
                "subject": header_dict.get("subject", ""),
                "sender": header_dict.get("from", ""),
                "date": header_dict.get("date", ""),
                "body": body,
                "snippet": message.get("snippet", ""),
                "list_unsubscribe": header_dict.get("list-unsubscribe", ""),
            }

        except HttpError as error:
            print(f"Error getting email {message_id}: {error}")
            return None

    def _extract_body(self, payload: dict) -> str:
        """Extract the email body from the message payload."""
        import base64

        body = ""

        if "body" in payload and payload["body"].get("data"):
            body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8")
            return body

        if "parts" in payload:
            for part in payload["parts"]:
                mime_type = part.get("mimeType", "")

                if mime_type == "text/plain" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8")
                    break
                elif mime_type == "text/html" and part.get("body", {}).get("data"):
                    body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8")

                if "parts" in part:
                    nested_body = self._extract_body(part)
                    if nested_body:
                        body = nested_body
                        break

        return body


def save_results(summary: PromotionSummary, output_path: Path):
    """Save analysis results to a JSON file."""
    data = {
        "analyzed_at": datetime.now().isoformat(),
        "total_analyzed": summary.total_analyzed,
        "statistics": {
            "keep_count": len(summary.keep),
            "unsubscribe_count": len(summary.unsubscribe),
            "review_count": len(summary.review),
        },
        "unsubscribe": [
            {
                "sender_name": p.sender_name,
                "sender_email": p.sender_email,
                "category": p.category,
                "email_type": p.email_type,
                "usefulness_score": p.usefulness_score,
                "spam_indicators": p.spam_indicators,
                "recommendation_reason": p.recommendation_reason,
                "unsubscribe_link": p.unsubscribe_link,
                "estimated_frequency": p.estimated_frequency,
            }
            for p in summary.unsubscribe
        ],
        "review": [
            {
                "sender_name": p.sender_name,
                "sender_email": p.sender_email,
                "category": p.category,
                "usefulness_score": p.usefulness_score,
                "recommendation_reason": p.recommendation_reason,
            }
            for p in summary.review
        ],
        "keep": [
            {
                "sender_name": p.sender_name,
                "sender_email": p.sender_email,
                "category": p.category,
                "value_indicators": p.value_indicators,
            }
            for p in summary.keep
        ],
    }

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nResults saved to: {output_path}")


def progress_callback(current: int, total: int):
    """Display progress during analysis."""
    percent = (current / total) * 100
    bar_length = 30
    filled = int(bar_length * current / total)
    bar = "=" * filled + "-" * (bar_length - filled)
    print(f"\rAnalyzing: [{bar}] {current}/{total} ({percent:.1f}%)", end="", flush=True)
    if current == total:
        print()  # New line when complete


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Gmail promotional emails and get unsubscribe recommendations."
    )
    parser.add_argument(
        "--max-emails",
        type=int,
        default=50,
        help="Maximum number of emails to analyze (default: 50)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Look back this many days (default: 30, 0 = all time)",
    )
    parser.add_argument(
        "--unread-only",
        action="store_true",
        help="Only analyze unread emails",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/promotion_analysis.json",
        help="Output file for results (default: data/promotion_analysis.json)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only show summary, not full report",
    )

    args = parser.parse_args()

    print("=" * 60)
    print("GMAIL PROMOTION SORTER")
    print("=" * 60)
    print()

    # Validate Anthropic API key
    if not Config.ANTHROPIC_API_KEY:
        print("Error: ANTHROPIC_API_KEY is not set in your .env file")
        print("Please add your Anthropic API key to the .env file")
        sys.exit(1)

    # Ensure directories exist
    Config.ensure_directories()

    # Initialize Gmail fetcher
    print("Connecting to Gmail...")
    fetcher = GmailPromotionFetcher()

    if not fetcher.authenticate():
        print("Failed to authenticate with Gmail")
        sys.exit(1)

    print("Successfully connected to Gmail!")
    print()

    # Fetch promotional emails
    print(f"Fetching up to {args.max_emails} promotional emails from the last {args.days} days...")
    emails = fetcher.get_promotional_emails(
        max_results=args.max_emails,
        days_back=args.days,
        include_read=not args.unread_only,
    )

    if not emails:
        print("\nNo promotional emails found matching your criteria.")
        sys.exit(0)

    print(f"\nFound {len(emails)} promotional emails to analyze")
    print()

    # Analyze emails
    print("Analyzing emails with Claude AI...")
    print("This may take a few moments depending on the number of emails.\n")

    analyzer = PromotionAnalyzer()
    summary = analyzer.analyze_batch(emails, progress_callback=progress_callback)

    # Display results
    print()
    if not args.quiet:
        report = format_summary_report(summary)
        print(report)

    # Quick summary
    print("\nQUICK SUMMARY:")
    print(f"  Recommended to unsubscribe: {len(summary.unsubscribe)} senders")
    print(f"  Recommended to keep: {len(summary.keep)} senders")
    print(f"  Needs your review: {len(summary.review)} senders")

    # Save results
    output_path = Path(args.output)
    output_path.parent.mkdir(exist_ok=True)
    save_results(summary, output_path)

    # Show top unsubscribe recommendations
    if summary.unsubscribe:
        print("\n" + "-" * 60)
        print("TOP UNSUBSCRIBE RECOMMENDATIONS:")
        print("-" * 60)
        for i, promo in enumerate(summary.unsubscribe[:5], 1):
            print(f"\n{i}. {promo.sender_name}")
            print(f"   Reason: {promo.recommendation_reason}")
            if promo.unsubscribe_link:
                print(f"   Unsubscribe link: {promo.unsubscribe_link[:80]}...")

    print("\n" + "=" * 60)
    print("Analysis complete!")
    print(f"Full results saved to: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
