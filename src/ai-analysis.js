/*
  AI ANALYSIS MODULE
  ==================
  Calls Claude API to generate a structured analysis of startup submissions.
  Requires ANTHROPIC_API_KEY environment variable.
*/

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const enabled = !!ANTHROPIC_API_KEY;

console.log(`[AI] Module loaded. Enabled: ${enabled}`);

const SYSTEM_PROMPT = `You are an experienced venture capital analyst. Given a startup submission, produce a structured JSON analysis. Be specific, data-driven, and honest. Do not sugarcoat red flags.

Respond ONLY with valid JSON, no markdown backticks, no preamble. Use this exact structure:

{
  "summary": "2-3 sentence executive summary of the startup",
  "readiness_score": 7.5,
  "strengths": [
    {"title": "Short title", "detail": "1-2 sentence explanation"}
  ],
  "red_flags": [
    {"title": "Short title", "detail": "1-2 sentence explanation"}
  ],
  "market_size": "Brief market size context with any known data points",
  "comparables": [
    {"name": "Company Name (region/type)", "context": "Brief relevance note"}
  ],
  "suggested_questions": [
    "Question an investor should ask the founder"
  ]
}

Rules:
- readiness_score: 1-10 scale. Be honest. Most pre-seed startups are 4-6. Only score 8+ if traction is exceptional.
- strengths: 3-5 items
- red_flags: 2-4 items. Always find at least 2. No startup is perfect.
- comparables: 2-4 companies. Include both positive comparisons and cautionary tales.
- suggested_questions: 4-6 questions. Focus on what's missing from the submission.`;

async function analyzeSubmission(submission) {
  if (!enabled) {
    console.log("[AI] Skipped: No API key configured");
    return null;
  }

  const userPrompt = `Analyze this startup submission:

Company: ${submission.company_name}
One-liner: ${submission.one_liner}
Industry: ${submission.industry}
Stage: ${submission.stage}
Team Size: ${submission.team_size || "Not specified"}
Website: ${submission.website || "Not provided"}
Funding Target: ${submission.funding_target || "Not specified"}

PROBLEM:
${submission.problem}

SOLUTION:
${submission.solution}

TRACTION:
${submission.traction}

LOOKING FOR:
${submission.looking_for}

ADDITIONAL NOTES:
${submission.additional_notes || "None"}`;

  try {
    console.log(`[AI] Analyzing: ${submission.company_name}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[AI] API error ${response.status}: ${err}`);
      return null;
    }

    const data = await response.json();
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse and validate JSON
    const clean = text.replace(/```json|```/g, "").trim();
    const analysis = JSON.parse(clean);

    // Basic validation
    if (!analysis.summary || !analysis.readiness_score || !analysis.strengths) {
      console.error("[AI] Invalid analysis structure");
      return null;
    }

    console.log(`[AI] Analysis complete for ${submission.company_name}: score ${analysis.readiness_score}/10`);
    return JSON.stringify(analysis);
  } catch (err) {
    console.error("[AI] Error:", err.message);
    return null;
  }
}

module.exports = { analyzeSubmission, enabled };
