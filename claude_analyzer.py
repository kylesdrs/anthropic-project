"""Claude API integration for job analysis and resume tailoring."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import anthropic

from config import Config
from job_extractor import JobPosting


@dataclass
class JobAnalysis:
    """Results of job analysis by Claude."""

    grade: str  # A, B, C, D, or F
    grade_reasoning: str
    fit_score: int  # 0-100
    strengths: list[str]
    concerns: list[str]
    tailored_resume: str
    cover_letter_points: list[str]
    recommendation: str  # Apply, Consider, Skip


class ClaudeAnalyzer:
    """Use Claude to analyze job fit and generate tailored resumes."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.model = Config.CLAUDE_MODEL
        self._resume: Optional[str] = None
        self._past_projects: Optional[list[dict]] = None
        self._grading_criteria: Optional[dict] = None

    def _load_resume(self) -> str:
        """Load the resume template."""
        if self._resume is None:
            with open(Config.RESUME_FILE, "r") as f:
                self._resume = f.read()
        return self._resume

    def _load_past_projects(self) -> list[dict]:
        """Load past project examples."""
        if self._past_projects is None:
            with open(Config.PAST_PROJECTS_FILE, "r") as f:
                self._past_projects = json.load(f)
        return self._past_projects

    def _load_grading_criteria(self) -> dict:
        """Load grading criteria."""
        if self._grading_criteria is None:
            with open(Config.GRADING_CRITERIA_FILE, "r") as f:
                self._grading_criteria = json.load(f)
        return self._grading_criteria

    def analyze_job(self, job: JobPosting) -> JobAnalysis:
        """
        Analyze a job posting for fit and generate a tailored resume.

        Args:
            job: The extracted job posting to analyze

        Returns:
            JobAnalysis with grade, tailored resume, and recommendations
        """
        resume = self._load_resume()
        past_projects = self._load_past_projects()
        grading_criteria = self._load_grading_criteria()

        # Build the analysis prompt
        prompt = self._build_analysis_prompt(job, resume, past_projects, grading_criteria)

        # Call Claude API
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        # Parse the response
        return self._parse_analysis_response(response.content[0].text)

    def _build_analysis_prompt(
        self,
        job: JobPosting,
        resume: str,
        past_projects: list[dict],
        grading_criteria: dict,
    ) -> str:
        """Build the prompt for job analysis."""

        projects_text = "\n\n".join(
            [
                f"**Project {i+1}: {p.get('title', 'Untitled')}**\n"
                f"Description: {p.get('description', 'N/A')}\n"
                f"Skills Used: {', '.join(p.get('skills', []))}\n"
                f"Outcome: {p.get('outcome', 'N/A')}"
                for i, p in enumerate(past_projects)
            ]
        )

        criteria_text = json.dumps(grading_criteria, indent=2)

        return f"""You are an expert job fit analyzer and resume writer. Analyze the following job posting
against the candidate's background and provide a detailed assessment.

## JOB POSTING

**Title:** {job.title}

**Description:**
{job.description}

**Budget:** {job.budget or 'Not specified'}
**Duration:** {job.duration or 'Not specified'}
**Experience Level:** {job.experience_level or 'Not specified'}
**Job Type:** {job.job_type or 'Not specified'}
**Required Skills:** {', '.join(job.skills) if job.skills else 'Not specified'}
**Client Info:** {job.client_info or 'Not specified'}

## CANDIDATE'S CURRENT RESUME

{resume}

## CANDIDATE'S PAST SUCCESSFUL PROJECTS

{projects_text}

## GRADING CRITERIA

{criteria_text}

## YOUR TASK

Analyze this job posting and provide your response in the following JSON format:

```json
{{
    "grade": "A/B/C/D/F",
    "grade_reasoning": "Detailed explanation of why this grade was assigned based on the criteria",
    "fit_score": 0-100,
    "strengths": ["strength1", "strength2", ...],
    "concerns": ["concern1", "concern2", ...],
    "recommendation": "Apply/Consider/Skip",
    "cover_letter_points": ["key point 1", "key point 2", ...],
    "tailored_resume": "The complete tailored resume text, optimized for this specific job posting"
}}
```

For the tailored resume:
1. Reorganize sections to highlight the most relevant experience first
2. Add keywords from the job posting where genuinely applicable
3. Emphasize past projects that are most similar to this job
4. Adjust the professional summary to target this specific role
5. Keep it concise but impactful

Respond ONLY with the JSON object, no additional text."""

    def _parse_analysis_response(self, response_text: str) -> JobAnalysis:
        """Parse Claude's response into a JobAnalysis object."""
        # Extract JSON from response (handle potential markdown code blocks)
        json_text = response_text.strip()
        if json_text.startswith("```"):
            # Remove markdown code block
            lines = json_text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```"):
                    in_block = not in_block
                    continue
                if in_block:
                    json_lines.append(line)
            json_text = "\n".join(json_lines)

        try:
            data = json.loads(json_text)
        except json.JSONDecodeError as e:
            # If JSON parsing fails, return a default analysis
            return JobAnalysis(
                grade="?",
                grade_reasoning=f"Failed to parse response: {e}",
                fit_score=0,
                strengths=[],
                concerns=["Could not analyze job posting"],
                tailored_resume="",
                cover_letter_points=[],
                recommendation="Skip",
            )

        return JobAnalysis(
            grade=data.get("grade", "?"),
            grade_reasoning=data.get("grade_reasoning", ""),
            fit_score=data.get("fit_score", 0),
            strengths=data.get("strengths", []),
            concerns=data.get("concerns", []),
            tailored_resume=data.get("tailored_resume", ""),
            cover_letter_points=data.get("cover_letter_points", []),
            recommendation=data.get("recommendation", "Skip"),
        )


if __name__ == "__main__":
    # Test the analyzer (requires valid config and data files)
    from job_extractor import JobPosting

    # Create a sample job posting
    sample_job = JobPosting(
        title="Senior Python Developer",
        description="Looking for an experienced Python developer to build REST APIs and data pipelines.",
        budget="$60-80/hr",
        duration="3 months",
        skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        experience_level="Expert",
        job_type="Hourly",
        client_info="Payment Verified, 50 jobs posted",
        raw_content="",
        email_id="test",
        email_subject="Job: Senior Python Developer",
    )

    analyzer = ClaudeAnalyzer()
    print("Testing Claude Analyzer...")
    print("Note: This requires valid configuration and data files to run.")
