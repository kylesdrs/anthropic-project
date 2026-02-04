"""Claude API integration for analyzing promotional emails and recommending unsubscribes."""

import json
import re
from dataclasses import dataclass, field
from typing import Optional

import anthropic
from bs4 import BeautifulSoup

from config import Config


@dataclass
class PromotionAnalysis:
    """Results of promotional email analysis by Claude."""

    sender_name: str  # Company or sender name
    sender_email: str  # Email address
    category: str  # e.g., "Retail", "Tech", "Finance", "News", "Social", etc.
    email_type: str  # "Newsletter", "Marketing", "Transactional", "Announcement"
    usefulness_score: int  # 0-100 (how useful/wanted this might be)
    spam_indicators: list[str]  # Signs this might be unwanted
    value_indicators: list[str]  # Signs this might be valuable
    recommendation: str  # "Keep", "Unsubscribe", "Review"
    recommendation_reason: str  # Why this recommendation
    unsubscribe_link: Optional[str] = None  # Extracted unsubscribe link
    estimated_frequency: str = "Unknown"  # How often they email


@dataclass
class PromotionSummary:
    """Summary of all analyzed promotions grouped by recommendation."""

    total_analyzed: int = 0
    keep: list[PromotionAnalysis] = field(default_factory=list)
    unsubscribe: list[PromotionAnalysis] = field(default_factory=list)
    review: list[PromotionAnalysis] = field(default_factory=list)
    senders_by_frequency: dict = field(default_factory=dict)  # sender -> count


class PromotionAnalyzer:
    """Use Claude to analyze promotional emails and recommend unsubscribes."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        self.model = Config.CLAUDE_MODEL

    def extract_unsubscribe_link(self, email_body: str) -> Optional[str]:
        """Extract unsubscribe link from email body."""
        # Try to find unsubscribe link in HTML
        soup = BeautifulSoup(email_body, "lxml")

        # Look for links with unsubscribe text
        for link in soup.find_all("a", href=True):
            link_text = link.get_text().lower()
            href = link["href"].lower()

            if any(
                term in link_text or term in href
                for term in ["unsubscribe", "opt-out", "opt out", "remove", "manage preferences", "email preferences"]
            ):
                return link["href"]

        # Try regex patterns for plain text
        patterns = [
            r'https?://[^\s<>"]+unsubscribe[^\s<>"]*',
            r'https?://[^\s<>"]+opt-?out[^\s<>"]*',
            r'https?://[^\s<>"]+email.preferences[^\s<>"]*',
        ]

        for pattern in patterns:
            match = re.search(pattern, email_body, re.IGNORECASE)
            if match:
                return match.group(0)

        return None

    def analyze_promotion(self, email: dict) -> PromotionAnalysis:
        """
        Analyze a promotional email and provide unsubscribe recommendation.

        Args:
            email: Dictionary with id, subject, sender, date, body, snippet

        Returns:
            PromotionAnalysis with recommendation and details
        """
        # Extract unsubscribe link first
        unsubscribe_link = self.extract_unsubscribe_link(email.get("body", ""))

        # Clean up body for analysis (strip HTML for cleaner analysis)
        soup = BeautifulSoup(email.get("body", ""), "lxml")
        clean_body = soup.get_text(separator=" ", strip=True)[:3000]  # Limit length

        # Build the analysis prompt
        prompt = self._build_analysis_prompt(email, clean_body)

        # Call Claude API
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        # Parse the response
        analysis = self._parse_analysis_response(response.content[0].text)
        analysis.unsubscribe_link = unsubscribe_link

        return analysis

    def analyze_batch(self, emails: list[dict], progress_callback=None) -> PromotionSummary:
        """
        Analyze a batch of promotional emails.

        Args:
            emails: List of email dictionaries
            progress_callback: Optional callback(current, total) for progress updates

        Returns:
            PromotionSummary with categorized results
        """
        summary = PromotionSummary()
        summary.total_analyzed = len(emails)

        for i, email in enumerate(emails):
            if progress_callback:
                progress_callback(i + 1, len(emails))

            try:
                analysis = self.analyze_promotion(email)

                # Track sender frequency
                sender = analysis.sender_email
                summary.senders_by_frequency[sender] = summary.senders_by_frequency.get(sender, 0) + 1

                # Categorize by recommendation
                if analysis.recommendation == "Keep":
                    summary.keep.append(analysis)
                elif analysis.recommendation == "Unsubscribe":
                    summary.unsubscribe.append(analysis)
                else:
                    summary.review.append(analysis)

            except Exception as e:
                print(f"Error analyzing email {email.get('id', 'unknown')}: {e}")
                # Create a default "Review" analysis for failed emails
                summary.review.append(
                    PromotionAnalysis(
                        sender_name="Unknown",
                        sender_email=email.get("sender", "unknown"),
                        category="Unknown",
                        email_type="Unknown",
                        usefulness_score=50,
                        spam_indicators=["Analysis failed"],
                        value_indicators=[],
                        recommendation="Review",
                        recommendation_reason=f"Could not analyze: {str(e)}",
                    )
                )

        return summary

    def _build_analysis_prompt(self, email: dict, clean_body: str) -> str:
        """Build the prompt for promotion analysis."""
        return f"""You are an expert email analyst helping a user decide which promotional emails to unsubscribe from.
Analyze this promotional email and provide your assessment.

## EMAIL DETAILS

**From:** {email.get('sender', 'Unknown')}
**Subject:** {email.get('subject', 'No Subject')}
**Date:** {email.get('date', 'Unknown')}
**Preview:** {email.get('snippet', '')[:200]}

**Content (excerpt):**
{clean_body[:2000]}

## YOUR TASK

Analyze this promotional email and determine:
1. Who is sending this (company/brand name)
2. What category/industry this falls into
3. What type of email this is (newsletter, marketing, transactional, etc.)
4. How useful/valuable this type of email typically is (0-100)
5. Any spam or low-quality indicators
6. Any value indicators that suggest keeping it
7. Your recommendation: Keep, Unsubscribe, or Review

Provide your response in this exact JSON format:

```json
{{
    "sender_name": "Company or brand name",
    "sender_email": "extracted email address",
    "category": "Category (Retail/Tech/Finance/News/Social/Travel/Food/Health/Entertainment/Other)",
    "email_type": "Newsletter/Marketing/Transactional/Announcement/Alert",
    "usefulness_score": 0-100,
    "spam_indicators": ["indicator1", "indicator2"],
    "value_indicators": ["indicator1", "indicator2"],
    "estimated_frequency": "Daily/Weekly/Monthly/Occasional/Unknown",
    "recommendation": "Keep/Unsubscribe/Review",
    "recommendation_reason": "Brief explanation of why this recommendation"
}}
```

Guidelines for recommendations:
- **Keep**: Valuable newsletters, important account updates, services the user actively uses
- **Unsubscribe**: Aggressive marketing, companies user likely doesn't engage with, high frequency spam
- **Review**: Could be valuable but needs user input, legitimate but potentially unwanted

Respond ONLY with the JSON object, no additional text."""

    def _parse_analysis_response(self, response_text: str) -> PromotionAnalysis:
        """Parse Claude's response into a PromotionAnalysis object."""
        # Extract JSON from response
        json_text = response_text.strip()
        if json_text.startswith("```"):
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
            return PromotionAnalysis(
                sender_name="Parse Error",
                sender_email="unknown",
                category="Unknown",
                email_type="Unknown",
                usefulness_score=50,
                spam_indicators=[],
                value_indicators=[],
                recommendation="Review",
                recommendation_reason=f"Failed to parse response: {e}",
            )

        return PromotionAnalysis(
            sender_name=data.get("sender_name", "Unknown"),
            sender_email=data.get("sender_email", "unknown"),
            category=data.get("category", "Unknown"),
            email_type=data.get("email_type", "Unknown"),
            usefulness_score=data.get("usefulness_score", 50),
            spam_indicators=data.get("spam_indicators", []),
            value_indicators=data.get("value_indicators", []),
            recommendation=data.get("recommendation", "Review"),
            recommendation_reason=data.get("recommendation_reason", ""),
            estimated_frequency=data.get("estimated_frequency", "Unknown"),
        )


def format_summary_report(summary: PromotionSummary) -> str:
    """Format a human-readable summary report."""
    lines = [
        "=" * 60,
        "PROMOTIONAL EMAIL ANALYSIS REPORT",
        "=" * 60,
        f"\nTotal emails analyzed: {summary.total_analyzed}",
        f"  - Recommended to KEEP: {len(summary.keep)}",
        f"  - Recommended to UNSUBSCRIBE: {len(summary.unsubscribe)}",
        f"  - Needs REVIEW: {len(summary.review)}",
        "",
    ]

    if summary.unsubscribe:
        lines.extend([
            "-" * 60,
            "RECOMMENDED UNSUBSCRIBES",
            "-" * 60,
        ])
        for i, promo in enumerate(summary.unsubscribe, 1):
            lines.extend([
                f"\n{i}. {promo.sender_name} ({promo.category})",
                f"   Email: {promo.sender_email}",
                f"   Type: {promo.email_type} | Frequency: {promo.estimated_frequency}",
                f"   Reason: {promo.recommendation_reason}",
            ])
            if promo.spam_indicators:
                lines.append(f"   Spam indicators: {', '.join(promo.spam_indicators)}")
            if promo.unsubscribe_link:
                lines.append(f"   Unsubscribe: {promo.unsubscribe_link}")
            else:
                lines.append("   Unsubscribe: Link not found - manual unsubscribe needed")

    if summary.review:
        lines.extend([
            "",
            "-" * 60,
            "NEEDS YOUR REVIEW",
            "-" * 60,
        ])
        for i, promo in enumerate(summary.review, 1):
            lines.extend([
                f"\n{i}. {promo.sender_name} ({promo.category})",
                f"   Email: {promo.sender_email}",
                f"   Usefulness: {promo.usefulness_score}/100",
                f"   Reason: {promo.recommendation_reason}",
            ])

    if summary.keep:
        lines.extend([
            "",
            "-" * 60,
            "RECOMMENDED TO KEEP",
            "-" * 60,
        ])
        for i, promo in enumerate(summary.keep, 1):
            lines.extend([
                f"\n{i}. {promo.sender_name} ({promo.category})",
                f"   Type: {promo.email_type}",
                f"   Value: {', '.join(promo.value_indicators) if promo.value_indicators else 'N/A'}",
            ])

    lines.extend([
        "",
        "=" * 60,
        "END OF REPORT",
        "=" * 60,
    ])

    return "\n".join(lines)


if __name__ == "__main__":
    # Test the analyzer with a mock email
    analyzer = PromotionAnalyzer()
    print("Promotion Analyzer initialized.")
    print("Use promotion_sorter.py to run the full analysis.")
