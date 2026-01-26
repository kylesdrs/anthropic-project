"""Google Docs API integration for outputting job analyses."""

from datetime import datetime
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import Config
from job_extractor import JobPosting
from claude_analyzer import JobAnalysis

# Google Docs/Drive API scopes
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]


class DocsWriter:
    """Write job analyses to Google Docs."""

    def __init__(self):
        self.docs_service = None
        self.drive_service = None

    def authenticate(self) -> bool:
        """Authenticate with Google Docs and Drive APIs."""
        creds = None

        # Use same credentials path but different token file
        token_path = Path(Config.CREDENTIALS_DIR) / "docs_token.json"

        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not Path(Config.GMAIL_CREDENTIALS_PATH).exists():
                    print(f"Error: Credentials file not found at {Config.GMAIL_CREDENTIALS_PATH}")
                    return False

                flow = InstalledAppFlow.from_client_secrets_file(
                    Config.GMAIL_CREDENTIALS_PATH, SCOPES
                )
                creds = flow.run_local_server(port=0)

            token_path.parent.mkdir(exist_ok=True)
            with open(token_path, "w") as token:
                token.write(creds.to_json())

        self.docs_service = build("docs", "v1", credentials=creds)
        self.drive_service = build("drive", "v3", credentials=creds)
        return True

    def create_analysis_document(
        self, job: JobPosting, analysis: JobAnalysis
    ) -> Optional[str]:
        """
        Create a Google Doc with the job analysis and tailored resume.

        Args:
            job: The job posting that was analyzed
            analysis: The analysis results from Claude

        Returns:
            URL of the created document, or None if failed
        """
        if not self.docs_service:
            raise RuntimeError("Not authenticated. Call authenticate() first.")

        # Create document title
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        grade_emoji = self._grade_to_emoji(analysis.grade)
        doc_title = f"[{analysis.grade}] {job.title[:50]} - {timestamp}"

        try:
            # Create the document
            doc = self.docs_service.documents().create(body={"title": doc_title}).execute()
            doc_id = doc.get("documentId")

            # Build the document content
            requests = self._build_document_requests(job, analysis)

            # Update the document with content
            self.docs_service.documents().batchUpdate(
                documentId=doc_id, body={"requests": requests}
            ).execute()

            # Move to specified folder if configured
            if Config.GOOGLE_DOCS_FOLDER_ID:
                self._move_to_folder(doc_id, Config.GOOGLE_DOCS_FOLDER_ID)

            doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
            print(f"Created document: {doc_url}")
            return doc_url

        except HttpError as error:
            print(f"Error creating document: {error}")
            return None

    def _grade_to_emoji(self, grade: str) -> str:
        """Convert grade to emoji for visual indication."""
        emoji_map = {
            "A": "🟢",
            "B": "🟡",
            "C": "🟠",
            "D": "🔴",
            "F": "⛔",
        }
        return emoji_map.get(grade.upper(), "❓")

    def _build_document_requests(
        self, job: JobPosting, analysis: JobAnalysis
    ) -> list[dict]:
        """Build the Google Docs API requests to populate the document."""
        requests = []
        current_index = 1

        def add_text(text: str, bold: bool = False, heading: int = 0) -> int:
            """Add text and return the new index."""
            nonlocal current_index, requests

            # Insert text
            requests.append({
                "insertText": {
                    "location": {"index": current_index},
                    "text": text + "\n",
                }
            })

            text_end = current_index + len(text)

            # Apply formatting
            if heading > 0:
                requests.append({
                    "updateParagraphStyle": {
                        "range": {"startIndex": current_index, "endIndex": text_end + 1},
                        "paragraphStyle": {
                            "namedStyleType": f"HEADING_{min(heading, 6)}"
                        },
                        "fields": "namedStyleType",
                    }
                })
            elif bold:
                requests.append({
                    "updateTextStyle": {
                        "range": {"startIndex": current_index, "endIndex": text_end},
                        "textStyle": {"bold": True},
                        "fields": "bold",
                    }
                })

            current_index = text_end + 1
            return current_index

        # Document header
        add_text(f"Job Analysis: {job.title}", heading=1)
        add_text("")

        # Grade summary box
        add_text(f"GRADE: {analysis.grade} ({analysis.fit_score}/100)", bold=True)
        add_text(f"Recommendation: {analysis.recommendation}", bold=True)
        add_text("")

        # Grade reasoning
        add_text("Grade Reasoning", heading=2)
        add_text(analysis.grade_reasoning)
        add_text("")

        # Job details
        add_text("Job Details", heading=2)
        add_text(f"Budget: {job.budget or 'Not specified'}")
        add_text(f"Duration: {job.duration or 'Not specified'}")
        add_text(f"Experience Level: {job.experience_level or 'Not specified'}")
        add_text(f"Job Type: {job.job_type or 'Not specified'}")
        add_text(f"Skills: {', '.join(job.skills) if job.skills else 'Not specified'}")
        add_text(f"Client Info: {job.client_info or 'Not specified'}")
        add_text("")

        # Strengths
        add_text("Strengths (Why You're a Good Fit)", heading=2)
        for strength in analysis.strengths:
            add_text(f"• {strength}")
        add_text("")

        # Concerns
        add_text("Concerns (Things to Consider)", heading=2)
        for concern in analysis.concerns:
            add_text(f"• {concern}")
        add_text("")

        # Cover letter points
        add_text("Key Points for Cover Letter", heading=2)
        for point in analysis.cover_letter_points:
            add_text(f"• {point}")
        add_text("")

        # Job description
        add_text("Original Job Description", heading=2)
        add_text(job.description[:3000])  # Limit length
        add_text("")

        # Tailored resume
        add_text("=" * 50)
        add_text("TAILORED RESUME (Copy Below)", heading=1)
        add_text("=" * 50)
        add_text("")
        add_text(analysis.tailored_resume)

        return requests

    def _move_to_folder(self, file_id: str, folder_id: str):
        """Move a file to the specified folder."""
        try:
            # Get current parents
            file = self.drive_service.files().get(
                fileId=file_id, fields="parents"
            ).execute()
            previous_parents = ",".join(file.get("parents", []))

            # Move to new folder
            self.drive_service.files().update(
                fileId=file_id,
                addParents=folder_id,
                removeParents=previous_parents,
                fields="id, parents",
            ).execute()
        except HttpError as error:
            print(f"Warning: Could not move file to folder: {error}")


if __name__ == "__main__":
    # Test the docs writer
    writer = DocsWriter()

    if writer.authenticate():
        print("Successfully authenticated with Google Docs!")
        print("Ready to create documents.")
    else:
        print("Failed to authenticate with Google Docs")
