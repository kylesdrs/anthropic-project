#!/usr/bin/env python3
"""
Gmail Job Monitor - Main Orchestration Script

Monitors Gmail for Upwork job postings, analyzes them using Claude,
and outputs tailored resumes to Google Docs.
"""

import argparse
import sys
import time
from datetime import datetime

import schedule

from config import Config
from gmail_monitor import GmailMonitor
from job_extractor import JobExtractor
from claude_analyzer import ClaudeAnalyzer
from docs_writer import DocsWriter


class JobMonitor:
    """Main orchestration class for the job monitoring system."""

    def __init__(self):
        self.gmail = GmailMonitor()
        self.extractor = JobExtractor()
        self.analyzer = ClaudeAnalyzer()
        self.docs_writer = DocsWriter()
        self._authenticated = False

    def authenticate(self) -> bool:
        """Authenticate with all required services."""
        print("Authenticating with services...")

        # Authenticate Gmail
        print("  - Gmail API...", end=" ")
        if not self.gmail.authenticate():
            print("FAILED")
            return False
        print("OK")

        # Authenticate Google Docs
        print("  - Google Docs API...", end=" ")
        if not self.docs_writer.authenticate():
            print("FAILED")
            return False
        print("OK")

        # Verify Anthropic API key
        print("  - Anthropic API...", end=" ")
        if not Config.ANTHROPIC_API_KEY:
            print("FAILED (no API key)")
            return False
        print("OK")

        self._authenticated = True
        return True

    def process_new_emails(self) -> list[dict]:
        """
        Process all new Upwork emails.

        Returns:
            List of results with job, analysis, and doc URL
        """
        if not self._authenticated:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        results = []
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[{timestamp}] Checking for new Upwork emails...")

        # Get new emails
        emails = self.gmail.get_new_upwork_emails()
        print(f"Found {len(emails)} new email(s) to process")

        for email in emails:
            try:
                result = self._process_single_email(email)
                results.append(result)
            except Exception as e:
                print(f"Error processing email {email.get('id')}: {e}")
                results.append({
                    "email_id": email.get("id"),
                    "error": str(e),
                    "success": False,
                })

        return results

    def _process_single_email(self, email: dict) -> dict:
        """Process a single email through the full pipeline."""
        print(f"\n--- Processing: {email.get('subject', 'Unknown')[:60]}...")

        # Extract job posting
        print("  Extracting job details...")
        job = self.extractor.extract(email)
        print(f"  Title: {job.title}")
        print(f"  Budget: {job.budget or 'Not specified'}")
        print(f"  Skills: {', '.join(job.skills[:5])}..." if job.skills else "  Skills: Not specified")

        # Analyze with Claude
        print("  Analyzing job fit with Claude...")
        analysis = self.analyzer.analyze_job(job)
        print(f"  Grade: {analysis.grade} ({analysis.fit_score}/100)")
        print(f"  Recommendation: {analysis.recommendation}")

        # Create Google Doc
        print("  Creating Google Doc...")
        doc_url = self.docs_writer.create_analysis_document(job, analysis)

        # Mark email as processed
        self.gmail.mark_as_processed(email["id"])

        result = {
            "email_id": email["id"],
            "job_title": job.title,
            "grade": analysis.grade,
            "fit_score": analysis.fit_score,
            "recommendation": analysis.recommendation,
            "doc_url": doc_url,
            "success": True,
        }

        print(f"  ✓ Complete! Doc: {doc_url}")
        return result

    def run_once(self) -> list[dict]:
        """Run the monitor once and process all new emails."""
        return self.process_new_emails()

    def run_scheduled(self, interval_minutes: int = None):
        """
        Run the monitor on a schedule.

        Args:
            interval_minutes: How often to check (defaults to config value)
        """
        interval = interval_minutes or Config.POLL_INTERVAL_MINUTES

        print(f"\nStarting scheduled monitoring (every {interval} minutes)")
        print("Press Ctrl+C to stop\n")

        # Run immediately, then schedule
        self.process_new_emails()

        schedule.every(interval).minutes.do(self.process_new_emails)

        while True:
            schedule.run_pending()
            time.sleep(60)  # Check schedule every minute


def validate_setup() -> bool:
    """Validate that all required files and configuration are in place."""
    print("Validating setup...")
    Config.ensure_directories()

    errors = Config.validate()
    if errors:
        print("\nConfiguration errors found:")
        for error in errors:
            print(f"  ✗ {error}")
        print("\nPlease fix these errors before running.")
        print("See SETUP.md for instructions.")
        return False

    print("  ✓ All configuration valid")
    return True


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Monitor Gmail for Upwork job postings and generate tailored resumes"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run once and exit (don't run on schedule)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        help="Polling interval in minutes (overrides config)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Only validate setup, don't run",
    )

    args = parser.parse_args()

    # Validate setup
    if not validate_setup():
        sys.exit(1)

    if args.validate:
        print("\nSetup validation complete!")
        sys.exit(0)

    # Initialize and authenticate
    monitor = JobMonitor()
    if not monitor.authenticate():
        print("\nAuthentication failed. Please check your credentials.")
        sys.exit(1)

    print("\n" + "=" * 50)
    print("Gmail Job Monitor - Ready")
    print("=" * 50)

    # Run
    if args.once:
        results = monitor.run_once()
        print(f"\nProcessed {len(results)} email(s)")

        # Print summary
        for r in results:
            if r.get("success"):
                print(f"  [{r['grade']}] {r['job_title'][:40]}... -> {r['doc_url']}")
            else:
                print(f"  [ERROR] {r.get('email_id')}: {r.get('error')}")
    else:
        try:
            monitor.run_scheduled(args.interval)
        except KeyboardInterrupt:
            print("\n\nStopping monitor...")
            sys.exit(0)


if __name__ == "__main__":
    main()
