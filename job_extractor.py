"""Extract job posting details from Upwork notification emails."""

import re
from bs4 import BeautifulSoup
from dataclasses import dataclass
from typing import Optional


@dataclass
class JobPosting:
    """Represents an extracted Upwork job posting."""

    title: str
    description: str
    budget: Optional[str]
    duration: Optional[str]
    skills: list[str]
    experience_level: Optional[str]
    job_type: Optional[str]  # Hourly or Fixed
    client_info: Optional[str]
    raw_content: str
    email_id: str
    email_subject: str

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "title": self.title,
            "description": self.description,
            "budget": self.budget,
            "duration": self.duration,
            "skills": self.skills,
            "experience_level": self.experience_level,
            "job_type": self.job_type,
            "client_info": self.client_info,
            "email_id": self.email_id,
        }


class JobExtractor:
    """Extract job posting details from Upwork email content."""

    def extract(self, email: dict) -> JobPosting:
        """
        Extract job posting information from an Upwork email.

        Args:
            email: Dictionary containing email data (body, subject, etc.)

        Returns:
            JobPosting object with extracted information
        """
        body = email.get("body", "")
        subject = email.get("subject", "")

        # Parse HTML if present
        if "<html" in body.lower() or "<div" in body.lower():
            text_content = self._html_to_text(body)
        else:
            text_content = body

        # Extract components
        title = self._extract_title(subject, text_content)
        description = self._extract_description(text_content)
        budget = self._extract_budget(text_content)
        duration = self._extract_duration(text_content)
        skills = self._extract_skills(text_content)
        experience_level = self._extract_experience_level(text_content)
        job_type = self._extract_job_type(text_content)
        client_info = self._extract_client_info(text_content)

        return JobPosting(
            title=title,
            description=description,
            budget=budget,
            duration=duration,
            skills=skills,
            experience_level=experience_level,
            job_type=job_type,
            client_info=client_info,
            raw_content=text_content,
            email_id=email.get("id", ""),
            email_subject=subject,
        )

    def _html_to_text(self, html: str) -> str:
        """Convert HTML email content to plain text."""
        soup = BeautifulSoup(html, "lxml")

        # Remove script and style elements
        for element in soup(["script", "style"]):
            element.decompose()

        # Get text and clean up whitespace
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join(line for line in lines if line)

        return text

    def _extract_title(self, subject: str, content: str) -> str:
        """Extract job title from email subject or content."""
        # Try to extract from subject line (common format: "Job: Title Here")
        subject_match = re.search(r"(?:Job:|New Job:)\s*(.+?)(?:\s*-\s*Upwork)?$", subject, re.I)
        if subject_match:
            return subject_match.group(1).strip()

        # Look for title patterns in content
        title_patterns = [
            r"Job Title[:\s]+(.+?)(?:\n|$)",
            r"^(.+?)\n(?:Posted|Budget|Hourly)",
        ]

        for pattern in title_patterns:
            match = re.search(pattern, content, re.I | re.M)
            if match:
                return match.group(1).strip()

        # Fall back to subject line cleaned up
        cleaned_subject = re.sub(r"\s*-\s*Upwork.*$", "", subject, flags=re.I)
        return cleaned_subject.strip() or "Unknown Job Title"

    def _extract_description(self, content: str) -> str:
        """Extract the main job description."""
        # Common patterns in Upwork emails
        desc_patterns = [
            r"(?:Job Description|Description|About the job)[:\s]*\n(.+?)(?=\n(?:Budget|Hourly|Skills|Posted|Duration|Experience|$))",
            r"(?:Looking for|We need|Seeking)[:\s]*(.+?)(?=\n(?:Budget|Hourly|Skills|Posted|$))",
        ]

        for pattern in desc_patterns:
            match = re.search(pattern, content, re.I | re.S)
            if match:
                desc = match.group(1).strip()
                # Clean up excessive whitespace
                desc = re.sub(r"\n{3,}", "\n\n", desc)
                return desc

        # If no pattern matches, try to get the main body content
        # Remove common header/footer content
        cleaned = re.sub(
            r"(?:View Job Posting|Apply Now|Unsubscribe|View in browser).*",
            "",
            content,
            flags=re.I | re.S,
        )
        cleaned = re.sub(r"(?:Budget|Skills|Duration|Posted)[:\s].+?(?=\n)", "", cleaned, flags=re.I)

        # Return first substantial paragraph
        paragraphs = [p.strip() for p in cleaned.split("\n\n") if len(p.strip()) > 50]
        if paragraphs:
            return paragraphs[0]

        return content[:1000]  # Fallback to first 1000 chars

    def _extract_budget(self, content: str) -> Optional[str]:
        """Extract budget information."""
        patterns = [
            r"Budget[:\s]*\$?([\d,]+(?:\s*-\s*\$?[\d,]+)?(?:\s*(?:USD|CAD|EUR|/hr|per hour|hourly))?)",
            r"Hourly[:\s]*\$?([\d,]+(?:\s*-\s*\$?[\d,]+)?(?:\s*/hr)?)",
            r"Fixed[- ]?Price[:\s]*\$?([\d,]+(?:\s*-\s*\$?[\d,]+)?)",
            r"\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*-\s*\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)?)",
        ]

        for pattern in patterns:
            match = re.search(pattern, content, re.I)
            if match:
                return match.group(1).strip()

        return None

    def _extract_duration(self, content: str) -> Optional[str]:
        """Extract project duration."""
        patterns = [
            r"Duration[:\s]*(.+?)(?:\n|$)",
            r"Project Length[:\s]*(.+?)(?:\n|$)",
            r"Timeline[:\s]*(.+?)(?:\n|$)",
            r"(\d+(?:\+)?\s*(?:weeks?|months?|days?))",
        ]

        for pattern in patterns:
            match = re.search(pattern, content, re.I)
            if match:
                return match.group(1).strip()

        return None

    def _extract_skills(self, content: str) -> list[str]:
        """Extract required skills."""
        patterns = [
            r"Skills[:\s]*(.+?)(?:\n\n|\n(?=[A-Z]))",
            r"Required Skills[:\s]*(.+?)(?:\n\n|\n(?=[A-Z]))",
            r"Skills Required[:\s]*(.+?)(?:\n\n|\n(?=[A-Z]))",
        ]

        for pattern in patterns:
            match = re.search(pattern, content, re.I | re.S)
            if match:
                skills_text = match.group(1).strip()
                # Split by common delimiters
                skills = re.split(r"[,\n•·|]", skills_text)
                skills = [s.strip() for s in skills if s.strip() and len(s.strip()) > 1]
                return skills[:15]  # Limit to 15 skills

        return []

    def _extract_experience_level(self, content: str) -> Optional[str]:
        """Extract required experience level."""
        patterns = [
            r"Experience Level[:\s]*(.+?)(?:\n|$)",
            r"Experience[:\s]*(Entry|Intermediate|Expert|Senior|Junior)",
            r"(Entry[- ]Level|Intermediate|Expert|Senior[- ]Level|Junior[- ]Level)",
        ]

        for pattern in patterns:
            match = re.search(pattern, content, re.I)
            if match:
                return match.group(1).strip()

        return None

    def _extract_job_type(self, content: str) -> Optional[str]:
        """Extract job type (Hourly or Fixed Price)."""
        if re.search(r"Hourly", content, re.I):
            return "Hourly"
        elif re.search(r"Fixed[- ]?Price", content, re.I):
            return "Fixed Price"
        return None

    def _extract_client_info(self, content: str) -> Optional[str]:
        """Extract client information if available."""
        patterns = [
            r"Client[:\s]*(.+?)(?:\n\n|\n(?=Budget|Skills|Posted))",
            r"About the Client[:\s]*(.+?)(?:\n\n)",
            r"Payment (?:Method )?Verified",
            r"(\d+(?:\.\d+)?\s*(?:jobs? posted|\$\s*spent))",
        ]

        info_parts = []
        for pattern in patterns:
            match = re.search(pattern, content, re.I)
            if match:
                info_parts.append(match.group(0).strip())

        return " | ".join(info_parts) if info_parts else None


if __name__ == "__main__":
    # Test with sample email content
    sample_email = {
        "id": "test123",
        "subject": "Job: Python Developer Needed - Upwork",
        "body": """
        <html>
        <body>
        <h2>Python Developer Needed</h2>

        <p>Job Description:</p>
        <p>We are looking for an experienced Python developer to help build
        a data processing pipeline. The ideal candidate should have experience
        with pandas, asyncio, and REST APIs.</p>

        <p>Budget: $50-75/hr</p>
        <p>Duration: 2-3 months</p>
        <p>Experience Level: Intermediate</p>
        <p>Skills: Python, Pandas, REST API, AsyncIO</p>

        <p>Client: Payment Verified, 15 jobs posted, $10K spent</p>
        </body>
        </html>
        """,
    }

    extractor = JobExtractor()
    job = extractor.extract(sample_email)

    print("Extracted Job Posting:")
    print(f"  Title: {job.title}")
    print(f"  Budget: {job.budget}")
    print(f"  Duration: {job.duration}")
    print(f"  Skills: {job.skills}")
    print(f"  Experience: {job.experience_level}")
    print(f"  Type: {job.job_type}")
    print(f"  Description: {job.description[:200]}...")
