/*
  AI ANALYSIS MODULE v3 - Web-Verified African Market Screening
  =============================================================
  Enhanced with:
  - Web search verification of startup claims
  - Industry-specific evaluation criteria
  - South African / African market context
  - Real-time competitor and market research
  
  Requires ANTHROPIC_API_KEY environment variable.
*/

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const enabled = !!ANTHROPIC_API_KEY;
console.log(`[AI] Module v3 loaded (web-verified). Enabled: ${enabled}`);

const INDUSTRY_CONTEXT = {
  "FinTech": {
    criteria: "FINTECH EVALUATION: Regulatory status with FSCA/SARB? Sandbox participation? Unit economics and default rates if lending? Building on existing rails (M-Pesa, Ozow, Stitch) or own? B-BBEE Level 1-4 required for financial services. Competition: Yoco, TymeBank, Discovery Bank, Jumo, Peach Payments. Cross-border regulatory complexity (CBK Kenya, CBN Nigeria, SARB SA).",
    comps: "African FinTech: Flutterwave, Chipper Cash, TymeBank, Jumo, M-Pesa, Yoco, Stitch, Ozow, MFS Africa."
  },
  "HealthTech": {
    criteria: "HEALTHTECH EVALUATION: Clinical validation evidence? SAHPRA approval needed? Targeting public (80% population) or private healthcare? NHI rollout positioning? POPIA health data compliance? Integration with paper-based clinic systems? SA healthcare worker shortage - solutions reducing workload score higher.",
    comps: "African HealthTech: hearX Group, mPharma, Helium Health, Zuri Health, Babylon Health Africa."
  },
  "CleanTech": {
    criteria: "CLEANTECH EVALUATION: Load shedding creates immediate demand. Grid-connected vs off-grid? Carbon credit revenue potential? REIPPP programme alignment? SA mineral resources for battery/storage. Water scarcity solutions. Just Energy Transition ($8.5B international funding).",
    comps: "African CleanTech: Arnergy, Sun King, M-KOPA, PowerGen, Daystar Power, SolarAfrica, Revego."
  },
  "EdTech": {
    criteria: "EDTECH EVALUATION: SETA grant access changes unit economics entirely. B-BBEE skills development scoring for corporate clients. Digital divide - 40%+ lack reliable internet, offline-capable scores higher. NSFAS market (1M+ funded students). 55% youth unemployment - education-to-employment pipeline most valuable. 11 official languages. WeThinkCode/ALX model precedent.",
    comps: "African EdTech: GetSmarter (acquired by 2U), WeThinkCode, Moringa School, Andela, uLesson, SPARK Schools."
  },
  "Logistics & Supply Chain": {
    criteria: "LOGISTICS EVALUATION: Infrastructure constraints (road quality, Durban port congestion, border delays). Township last-mile challenges (informal addressing, security). AfCFTA cross-border opportunities. Cold chain underdevelopment. Informal sector bridging. SA e-commerce growing 30%+ annually.",
    comps: "African logistics: Lori Systems, Kobo360, Sendy, uAfrica, Pargo, The Courier Guy."
  },
  "SaaS": {
    criteria: "SAAS EVALUATION: ZAR vs USD pricing? SA has 2.6M SMEs mostly micro-enterprises with limited budgets. Enterprise sales cycles 6-12 months. POPIA local hosting requirements. Integration with Sage, Xero, Pastel, SAP. High SME failure rate impacts churn.",
    comps: "African SaaS: Paystack, SweepSouth, OfferZen, Platform45, DataProphet."
  },
  "AI & Machine Learning": {
    criteria: "AI EVALUATION: Proprietary African datasets (scarce and valuable)? Fine-tuning global models vs building from scratch? African language support (underserved by LLMs). Compute cost management. Genuine ML expertise vs API wrappers. Ethical AI considerations (bias in facial recognition, credit scoring fairness).",
    comps: "African AI: Lelapa AI, InstaDeep (acquired by BioNTech), Aerobotics, DataProphet."
  },
  "AgriTech": {
    criteria: "AGRITECH EVALUATION: Smallholder vs commercial farming (different markets). Water management in water-scarce SA. Farm-to-market logistics and cold chain. Input financing models. Climate resilience solutions. Land reform uncertainty and opportunity.",
    comps: "African AgriTech: Aerobotics, Khula, Apollo Agriculture, Twiga Foods, Agrikore."
  },
  "CyberSecurity": {
    criteria: "CYBERSECURITY EVALUATION: POPIA enforcement driving compliance demand. Financial sector requirements (SARB directives). Severe skills shortage - automation scores higher. Government market opportunity. SME market has massive scale potential.",
    comps: "African cybersecurity: Snode Technologies, Sendmarc, ESET Africa."
  }
};

const SA_CONTEXT = `AFRICAN MARKET CONTEXT: SA GDP ~$400B, largest African economy. 62M population, median age 28. 90%+ smartphone penetration. Load shedding affects all businesses. ZAR ~R18-19/USD with volatility. Regulations: POPIA, FICA, B-BBEE, NCA. VC ecosystem $500M-$1B annually. Pre-seed R1-5M, Seed R5-20M, Series A R20-80M. Key investors: Knife Capital, Naspers/Prosus, HAVAIC, Kalon, Partech Africa, Launch Africa. Limited JSE exits, mostly trade sales. Township economy 60%+ of consumer spending. Pan-African expansion typically SA->Kenya->Nigeria.`;

function buildSystemPrompt(industry) {
  const ctx = INDUSTRY_CONTEXT[industry] || { criteria: "Evaluate market size in Africa, regulatory hurdles, B-BBEE compliance, currency risk, talent availability, infrastructure dependencies.", comps: "Include African and emerging market comparables." };
  return `You are a senior VC analyst specialising in African startups with 15 years experience. You evaluate for a curated board of South Africa's most successful business leaders.

You have access to web search. USE IT to:
1. Verify if the startup's website exists and what it says
2. Search for the company name to find press coverage, funding announcements, or red flags
3. Research the specific market/competitors mentioned in their submission
4. Verify team claims if names are mentioned
5. Find recent news about the sector in Africa

After researching, produce your analysis as ONLY valid JSON, no markdown, no preamble:
{
  "summary": "2-3 sentences contextualised to African market, referencing what you found in your research",
  "readiness_score": 7.5,
  "verification": {
    "website_exists": true,
    "press_coverage": "Brief summary of what you found, or 'No coverage found'",
    "claims_verified": "Which traction claims could you verify or not verify",
    "competitor_landscape": "What you found about their stated competitors and market"
  },
  "strengths": [{"title": "Title", "detail": "1-2 sentences with African market context"}],
  "red_flags": [{"title": "Title", "detail": "1-2 sentences with SA/African risk context"}],
  "market_size": "Africa/SA specific TAM and SAM with data points from your research",
  "comparables": [{"name": "Company (region)", "context": "Relevance and outcome - use real data from search"}],
  "suggested_questions": ["Specific probing question based on gaps between their claims and what you found"],
  "sector_insight": "One paragraph of sector insight using current data from your research"
}

SCORING (calibrated to African startups):
1-3: Idea, no validation | 4-5: Early validation, pre-revenue | 5-6: MVP, early traction | 6-7: PMF signals | 7-8: Strong traction, proven unit economics | 8-9: Exceptional, regulatory approvals, term sheets | 9-10: Almost never

Rules: strengths 3-5 (at least one African-specific). red_flags 2-4 (always at least 2). comparables 2-4 from: ${ctx.comps} suggested_questions 4-6 (reference specific claims). verification section is REQUIRED.

IMPORTANT: If web search reveals information that contradicts the submission (inflated metrics, non-existent website, negative press), flag this prominently in red_flags and adjust the score accordingly. Board members trust us to verify, not just summarise.

${SA_CONTEXT}

${ctx.criteria}`;
}

async function analyzeSubmission(submission) {
  if (!enabled) { console.log("[AI] Skipped: No API key"); return null; }

  // Build search queries based on the submission
  const searchQueries = [
    `${submission.company_name} startup`,
    `${submission.company_name} ${submission.industry} Africa`,
  ];
  if (submission.website) {
    searchQueries.push(submission.website);
  }

  const userPrompt = `Analyze this startup submission. Use web search to verify their claims before scoring.

Company: ${submission.company_name}
One-liner: ${submission.one_liner}
Industry: ${submission.industry}
Stage: ${submission.stage}
Team Size: ${submission.team_size || "Not specified"}
Website: ${submission.website || "Not provided"}
Funding Target: ${submission.funding_target || "Not specified"}

PROBLEM: ${submission.problem}
SOLUTION: ${submission.solution}
TRACTION: ${submission.traction}
LOOKING FOR: ${submission.looking_for || "Not specified"}
ADDITIONAL NOTES: ${submission.additional_notes || "None"}

RESEARCH INSTRUCTIONS:
1. Search for "${submission.company_name}" to find any existing information
2. If a website is provided (${submission.website || "none"}), check if it exists
3. Search for competitors in ${submission.industry} in Africa
4. Search for recent ${submission.industry} funding and market news in South Africa/Africa
5. Use all research findings to inform your analysis and verification section`;

  try {
    console.log(`[AI] Analyzing with web search: ${submission.company_name} (${submission.industry})`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: buildSystemPrompt(submission.industry),
        messages: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[AI] API error ${response.status}: ${err}`);
      // Fallback: try without web search if it fails
      console.log("[AI] Retrying without web search...");
      return await analyzeWithoutSearch(submission);
    }

    const data = await response.json();
    
    // Extract text from response (may have multiple content blocks due to tool use)
    let text = "";
    for (const block of (data.content || [])) {
      if (block.type === "text" && block.text) {
        text = block.text;
      }
    }

    if (!text) {
      console.error("[AI] No text in response, trying without search");
      return await analyzeWithoutSearch(submission);
    }

    // Clean potential markdown fences
    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const analysis = JSON.parse(text);
    if (!analysis.readiness_score || !analysis.summary) {
      console.error("[AI] Invalid structure");
      return null;
    }

    console.log(`[AI] Score: ${analysis.readiness_score}/10 for ${submission.company_name} (web-verified)`);
    return JSON.stringify(analysis);
  } catch (error) {
    console.error("[AI] Error:", error.message);
    // Fallback to non-search version
    return await analyzeWithoutSearch(submission);
  }
}

// Fallback analysis without web search
async function analyzeWithoutSearch(submission) {
  const userPrompt = `Analyze this startup:
Company: ${submission.company_name}
One-liner: ${submission.one_liner}
Industry: ${submission.industry}
Stage: ${submission.stage}
Team Size: ${submission.team_size || "Not specified"}
Website: ${submission.website || "Not provided"}
Funding Target: ${submission.funding_target || "Not specified"}

PROBLEM: ${submission.problem}
SOLUTION: ${submission.solution}
TRACTION: ${submission.traction}
LOOKING FOR: ${submission.looking_for || "Not specified"}
ADDITIONAL NOTES: ${submission.additional_notes || "None"}

Note: Web verification was not available. Set the verification section to indicate claims could not be independently verified.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, system: buildSystemPrompt(submission.industry), messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!response.ok) { const err = await response.text(); console.error(`[AI] Fallback error ${response.status}: ${err}`); return null; }
    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const analysis = JSON.parse(clean);
    if (!analysis.readiness_score || !analysis.summary) return null;
    console.log(`[AI] Score: ${analysis.readiness_score}/10 for ${submission.company_name} (no web search)`);
    return JSON.stringify(analysis);
  } catch (error) { console.error("[AI] Fallback error:", error.message); return null; }
}

module.exports = { analyzeSubmission, enabled };
